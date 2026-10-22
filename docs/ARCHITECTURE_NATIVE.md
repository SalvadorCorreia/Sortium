# Sortium Native Architecture (Empirically Verified)

This document outlines the reverse-engineered native Steam client architecture for **Sortium**, verified directly against the running Steam client runtime via the Chrome DevTools Protocol (`http://localhost:8080/json`).

---

## 1. High-Level Native Architecture

```mermaid
flowchart TD
    subgraph UI_Layer["1. UI & Controls (Module 71395 / 50777)"]
        NativeDropdown["Steam Native Dropdown<br/><code>mod71395.OJ ('X') / mod50777.ZU</code>"]
        SortiumOptions["Injected Sortium Options<br/><code>[Sortium] HLTB, SteamDB...</code>"]
        NativeDropdown --> SortiumOptions
    end

    subgraph State_Layer["2. Sort State & Selection"]
        SortState["Sort State (eSortBy)<br/><code>mod71395.xZ ('Re')</code>"]
        SortiumOptions -- "User selects metric" --> SortState
    end

    subgraph Pipeline_Layer["3. Sorting Pipeline (Module 11726 & 71395)"]
        ComparatorFactory["Comparator Resolver<br/><code>mod11726.gQ ('z')</code>"]
        SortiumComparator["Sortium Metric Comparator<br/><code>(a, b) => valA - valB</code>"]
        SortRunner["Native Array Sorter<br/><code>mod71395.mt</code><br/><code>Ae.slice().sort(Ye)</code>"]
        
        SortState -- "eSortBy passed" --> ComparatorFactory
        ComparatorFactory -- "Returns Sortium comparator" --> SortiumComparator
        SortiumComparator --> SortRunner
    end

    subgraph Data_Layer["Sortium Data Engine & Storage"]
        LuaBackend["Lua Backend (Streams & Disk Cache)"]
        QueueService["Frontend Queue Service<br/><code>queueService</code>"]
        AppOverview["AppOverview Prototype Extension<br/><code>AppOverview.prototype.sortium</code>"]
        
        LuaBackend <--> QueueService
        QueueService --> AppOverview
        AppOverview -.-> SortiumComparator
    end

    subgraph Render_Layer["4. Native Grid & Capsule Badging (Module 66363)"]
        NativeGrid["Steam Virtualized Grid<br/><code>mod71395.ze / xe</code>"]
        NativeCapsule["Native Capsule Component<br/><code>mod66363.TK</code>"]
        SortiumBadge["Virtual DOM Injected Badge<br/><code>&lt;SortiumBadge appId=... /&gt;</code>"]

        SortRunner -- "Sorted AppOverview array" --> NativeGrid
        NativeGrid -- "Renders visible cells with sortByType" --> NativeCapsule
        SortState -. "sortByType prop" .-> NativeCapsule
        NativeCapsule --> SortiumBadge
    end
```

---

## 2. Sequence of a Sort Operation

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant DD as mod71395.OJ (Native Dropdown)
    participant State as mod71395.xZ (eSortBy State)
    participant Runner as mod71395.mt (Grid Builder)
    participant Factory as mod11726.gQ (Comparator Resolver)
    participant Queue as queueService / AppOverview
    participant Grid as mod71395.ze (CSSGrid)
    participant Capsule as mod66363.TK (AppCapsule)

    User->>DD: Selects "[Sortium] HLTB Main Story"
    DD->>State: OnChange("sortium_hltb_main")
    State->>Runner: Trigger re-render with eSortBy="sortium_hltb_main"
    Runner->>Factory: gQ("sortium_hltb_main")
    Factory-->>Runner: Returns Sortium comparator function
    Runner->>Queue: Compare games using cached metric values
    Runner->>Runner: Ae.slice().sort(comparator)
    Runner->>Grid: Hand sorted AppOverview array to virtual grid
    Grid->>Capsule: Render visible cells with sortByType="sortium_hltb_main"
    Capsule->>Capsule: Patched component injects <SortiumBadge> into children
    Capsule-->>User: Displays native capsule with clean Sortium metric badge
```

---

## 3. The 4 Verified Verification Pillars

### Pillar 1: Dropdown Injection & Option Filtering
- **Target Modules**: Webpack Module `71395` (Export `OJ`, internal class `X`) and Module `50777` (Export `ZU`, internal class `_e`).
- **Internal Structure**:
  - `OJ` renders `(0, e.jsx)(S.ZU, { rgOptions: Mt, onChange: this.OnChange })`.
  - Default options (`ke()`) generate the 10 native sorting choices (Alphabetical, Friends, Achievements, Hours, Last Played, Release Date, Date Added, Size on Disk, Metacritic, Review).
- **Interception Mechanism**:
  - MobX binds an own property on `OJ` instances during construction (`{ writable: false, configurable: false }`).
  - To patch, hook `mod71395.OJ.prototype.render` using `React.cloneElement` on the returned dropdown element, or patch `mod50777.ZU.prototype.BuildMenu`.
  - Options can be filtered or appended; user clicks fire `OnChange(we)` directly with `we.data`.

### Pillar 2: Sorting Pipeline Hook
- **Target Modules**: Webpack Module `11726` (Export `gQ`), invoked inside Module `71395` function `mt()`.
- **Internal Structure**:
  - Inside `mt()`:
    ```javascript
    Ye = (0, Y.gQ)(Ne); // Y is Module 11726, Ne is eSortBy
    Ft = Ye ? Ae.slice().sort(Ye) : Ae; // Ae is Array<AppOverview>
    ```
  - Inside `mod11726.gQ`:
    ```javascript
    function z(S) {
        let b;
        switch(S) { case u: b = j; break; ... } // Maps sort ID to comparator
        return (m, T) => b && b(m, T) || i.tw.CompareSortAs(m, T);
    }
    ```
- **Interception Mechanism**:
  - Patch `mod11726.gQ`: when `eSortBy` matches a Sortium metric ID, return Sortium's comparator callback `(a, b) => valA - valB`.
  - Steam's native `Ae.slice().sort(Ye)` executes the sort on the raw overviews, feeding sorted order directly to the native virtualized grid.

### Pillar 3: Internal Metric Storage
- **Target**: `window.appStore.GetAppOverviewByAppID(appid)`.
- **Internal Structure**:
  - Every game overview instance inherits from `AppOverview.prototype`.
- **Extension Mechanism**:
  - Attach reactive getters to `AppOverview.prototype`:
    ```javascript
    Object.defineProperty(AppOverview.prototype, 'sortium_hltb', {
        get() { return queueService.getCachedData('hltb', this.appid); },
        configurable: true
    });
    ```
  - Data becomes accessible natively across all Steam components handling `app` or `overview`.

### Pillar 4: Virtual DOM Capsule Badging
- **Target Module**: Webpack Module `66363` (Export `TK`).
- **Internal Structure**:
  - Rendered inside Module `71395` (`xe`) as:
    ```javascript
    (0, e.jsx)(H.TK, {
        app: zt,                // rt wrapper around m_overview
        sortByType: we.eSortBy, // Active sort key passed as a direct prop!
        nWidth: St,
        ...
    })
    ```
- **Interception Mechanism**:
  - `H.TK` is wrapped in `React.memo`.
  - Using Millennium `wrapReactType` or `afterPatch` on `mod66363.TK`: when `sortByType` matches a Sortium metric, append `<SortiumBadge appId={app.appid} />` to `ret.props.children`.
  - Injection occurs at the Virtual DOM level, keeping badges perfectly in sync with Steam's virtualized row/column recycling without `MutationObserver` overhead or flicker.
