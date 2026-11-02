# Sortium Native Architecture (Empirically Verified)

This document outlines the reverse-engineered native Steam client architecture for **Sortium**, verified directly against the running Steam client runtime via the Chrome DevTools Protocol (`http://localhost:8080/json`).

> [!IMPORTANT]
> **Dynamic Module Resolution**: Numeric Webpack module IDs (`71395`, `11726`, `66363`, `50777`) and 2-letter minified export keys (`OJ`, `gQ`, `TK`, `ZU`) are build-specific artifacts shown here for reference. Production code **must** resolve modules dynamically via `@steambrew/client` (`findModuleByExport`, `findClassModule`) using stable signatures (such as localization tokens like `"#Library_SortCollectionBy"` or CSS class keys like `SortingDropDown` and `LibraryItemBoxSubscript`).

---

## 1. High-Level Native Architecture

```mermaid
flowchart TD
    subgraph UI_Layer["1. UI & Controls (Mod 71395)"]
        NativeDropdown["Steam Native Sorting Dropdown<br/><code>OJ.prototype.render ('class X')</code>"]
        ClonePatch["React.cloneElement Patch<br/>Filters / Appends <code>rgOptions</code>"]
        NativeDropdown --> ClonePatch
    end

    subgraph State_Layer["2. Sort State & Persistence"]
        SortState["Sort State Hook (eSortBy)<br/><code>Re() / AppGridDisplaySettings</code>"]
        ClonePatch -- "OnChange(option.data)" --> SortState
    end

    subgraph Pipeline_Layer["3. Sorting & Sectioning Pipeline"]
        CollectionPage["Collection View Controller<br/><code>xt.prototype.render</code> / <code>mt()</code>"]
        ComparatorFallback["Native Comparator Resolver<br/><code>gQ(eSortBy) -> CompareSortAs(a, b)</code>"]
        SectionGrouper["Section Grouper<br/><code>Ue(overview, eSortBy)</code>"]
        
        SortState -- "eSortBy" --> CollectionPage
        CollectionPage --> ComparatorFallback
        ComparatorFallback --> SectionGrouper
    end

    subgraph Data_Layer["Sortium Data Engine & MobX Reactivity"]
        LuaBackend["Lua Backend (Streams & Disk Cache)"]
        QueueService["Frontend Queue Service<br/><code>queueService</code>"]
        AppOverview["AppOverview.prototype<br/>Reactive Metric Getters & <code>sort_as</code>"]
        
        LuaBackend <--> QueueService
        QueueService -- "Updates observable / triggers re-render" --> AppOverview
        AppOverview -.-> CollectionPage
        AppOverview -.-> ComparatorFallback
    end

    subgraph Render_Layer["4. Native Virtual Grid & Capsule Badging (Mod 66363)"]
        NativeGrid["Steam Virtualized Grid<br/><code>ze -> ut -> xe.type</code>"]
        NativeCapsule["Native Capsule Memo Component<br/><code>TK.type ('sr')</code>"]
        NativeSubscript["Native Subscript Pill<br/><code>LibraryItemBoxSubscript ('kt')</code>"]

        SectionGrouper -- "childSections (rt[])" --> NativeGrid
        NativeGrid -- "Unwraps zt.m_overview + sortByType" --> NativeCapsule
        SortState -. "sortByType prop" .-> NativeCapsule
        NativeCapsule --> NativeSubscript
    end
```

---

## 2. Sequence of a Sort Operation

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant DD as OJ.prototype.render (Dropdown)
    participant State as Re() (eSortBy State)
    participant View as xt / mt() (Grid Builder)
    participant Queue as queueService + AppOverview.prototype
    participant Grid as ze / xe (Virtual Grid)
    participant Capsule as TK.type (Native AppCapsule)

    User->>DD: Opens "Sort By" & selects Sortium metric
    DD->>State: Saves lastUsedMetric & passes eSortBy=5 (Last Played)
    State->>View: Re-renders with eSortBy=5
    View->>Queue: Enqueues visible collection AppIDs & reads cached metrics
    Queue-->>View: Supplies sorted AppOverview order & section labels via GetLastPlayedSectionName()
    View->>Grid: Passes grouped childSections (AppGridSection[]) to virtual grid
    Grid->>Capsule: Renders visible cells with app=AppOverview, sortByType=5
    Capsule->>Capsule: Patched TK.type passes sortByType=1 to suppress native date & injects LibraryItemBoxSubscript badge
    Capsule-->>User: Displays native section shelves & capsules with Sortium metric pills
```

---

## 3. Webpack 5 & MobX Runtime Constraints

Before patching any Steam module, three runtime invariants must be respected:

1. **Webpack 5 ES Module Export Getters are Non-Configurable**:
   Webpack defines module exports via `t.d(exports, { key: () => fn })`, which sets `{ get: [Function], set: undefined, configurable: false }`. Plain exported functions (`gQ`, `IJ`, `xZ`) **cannot** be overwritten on the module export object (`afterPatch(mod, 'gQ')` throws `TypeError`).
   - **Mutable Seams**: Only **Class `.prototype` methods** (`OJ.prototype.render`, `xt.prototype.render`, `AppOverview.prototype`) and **`React.memo` / `forwardRef` `.type` properties** (`TK.type`, where `{ writable: true, configurable: true }`) can be patched directly.
2. **MobX Locks Instance `render` Methods at Construction**:
   When a MobX class component calls `makeObservable(this)` (`(0, j.Gn)(this)`) in its constructor, MobX binds `this.render` as an own property on the instance with `{ writable: false, configurable: false }`, caching the prototype's `render` function inside its closure.
   - **Implication**: `OJ.prototype.render` must be patched at plugin initialization before collection views mount, or existing mounted instances must be remounted.
3. **React 18 Freezes Element `props`**:
   Elements returned by `(0, e.jsx)(...)` have `Object.isFrozen(element.props) === true`. Mutating `dropdown.props.rgOptions` in place fails silently or throws. Always clone via `React.cloneElement(dropdown, { rgOptions: nextOptions })`.

---

## 4. The 4 Verified Integration Pillars

### Pillar 1: Dropdown Injection & Option Filtering
- **Reference Target**: Module `71395`, export `OJ` (internal class `X`).
- **Dynamic Lookup**: Locate export whose `.prototype?.render?.toString()` contains `"#Library_SortCollectionBy"` and `"SortingDropDown"`.
- **Internal Structure**:
  ```javascript
  class X extends a.Component {
      OnChange(we) {
          this.props.onSortChangeCallback(we.data);
          this.m_elDivRef.current && this.m_elDivRef.current.focus();
      }
      render() {
          const { rgOptions: Ee, initialValue: Ae, ... } = this.props;
          const Mt = Ee || ke(); // 10 native sort options
          return (0, e.jsxs)("div", {
              className: (0, s.A)(A().SortingDropDown, we),
              children: [
                  !wt && (0, e.jsx)("div", { className: A().SortingDropDownLabel, children: tt }),
                  (0, e.jsx)(S.ZU, { rgOptions: Mt, onChange: this.OnChange, selectedOption: Ae, ... })
              ]
          });
      }
  }
  ```
- **Interception Mechanism**:
  Patch `OJ.prototype.render` using `React.cloneElement` on the child `<Dropdown>` (`S.ZU`) element to filter out unwanted native options (e.g., `Size on Disk = 8`, `Metacritic = 9`) and append Sortium options. Intercept `OnChange` (or `onChange` prop on the cloned `S.ZU`) to handle Sortium selections cleanly without polluting `window.localStorage.getItem("AppGridDisplaySettings")` with invalid enum IDs that would break Steam if Sortium is later disabled.

### Pillar 2: Sorting Pipeline & Sectioning Hook
- **Reference Target**: Module `71395` (`mt`, `Ue`, `Fe`) and Module `11726` (`gQ`).
- **Internal Structure**:
  1. `mt()` runs inside a MobX observer hook `(0, I.q3)(() => ...)`:
     ```javascript
     const Ye = (0, Y.gQ)(Ne);
     const Ft = Ye ? Ae.slice().sort(Ye) : Ae;
     ```
  2. Inside `mod11726.gQ(S)`:
     ```javascript
     function z(S) {
         let b;
         if (S != r) switch (S) { case u: b = j; break; ... }
         return (m, T) => b && b(m, T) || i.tw.CompareSortAs(m, T);
     }
     ```
  3. After sorting `Ft`, `mt()` calls `Ue(be, Ne)` (`ComputeChildSectionName`) on each `AppOverview` to group games into horizontal sections, wrapping each item in `new rt(be)`:
     ```javascript
     default:
         (0, m.wT)(!1, "Unknown sort type in ComputeChildSectionName");
     return "";
     ```
- **Interception & Reactivity Mechanism**:
  - Because `mod11726.gQ` and `Ue` are non-configurable internal/module functions, we do not patch them directly.
  - Instead, when a Sortium metric is selected, we pass `eSortBy = 5` (`Last Played`) to Steam. In `Ue(be, Ne)`, `case Y.CX` (`5`) is the only sort mode that delegates section header calculation to a prototype method on `AppOverview` (`be.GetLastPlayedSectionName()`), while keeping `localStorage` populated with a valid native enum ID.
  - We hook `Array.prototype.sort` when `compareFn.toString().includes('CompareSortAs')`:
    1. Lazily patch `AppOverview.prototype.GetLastPlayedSectionName` on `this[0]` to return `formatMetricValue(..., 'section')` when a Sortium metric is active, or delegate to the original method when a native Steam sort is active.
    2. Run the native `Array.prototype.sort` first to establish `CompareSortAs` tie-breaking order.
    3. When `settings.lastUsedMetric` is active, enqueue the collection's AppIDs into `queueService` and reorder the array in-place via `sortApps`. When a native Steam sort is active and `settings.sortDirection` differs from the option's default direction, reverse the sorted array in-place via `this.reverse()`.
    4. Trigger collection controller re-renders via Fiber tree traversal (`forceUpdateNativeCollectionViews`) on settings updates and throttled `queueService` batch resolutions.

### Pillar 3: Persistent Selection State
- **Target**: `PluginSettings.lastUsedMetric` and `PluginSettings.sortDirection` (`frontend/services/settings.ts` & `backend/settings.lua`).
- **Mechanism**:
  - `lastUsedMetric` is `""` when a native Steam sort option is active, or the metric ID (e.g., `"hltb_main"`) when a Sortium metric is active.
  - Persisting `lastUsedMetric` and `sortDirection` through `saveSettings` notifies all subscribed listeners immediately while keeping Steam's own `AppGridDisplaySettings` set to a valid native `eSortBy` (`5` when a Sortium metric is active).

### Pillar 4: Native Virtual DOM Capsule Badging
- **Reference Target**: Module `66363`, export `TK` (`React.memo` wrapping MobX observer around internal function `sr`), and CSS class `LibraryItemBoxSubscript`.
- **Internal Structure**:
  1. In Module `71395` (`xe`), Steam unwraps `zt.m_overview` so `H.TK` receives the raw `AppOverview` as `props.app`, `context: H.aT` (`1` = `InCollection`), and `sortByType: we.eSortBy`:
     ```javascript
     st = we.children.map((zt, St) => Mt(zt.m_overview, Ne.childWidth, St));
     ```
  2. Inside `mod66363.TK`, Steam renders a bottom pill `<div className={Z().LibraryItemBoxSubscript}>` between the capsule body fragment (`vdom.props.children[0]`) and the background glow (`vdom.props.children[1]`).
- **Interception Mechanism**:
  - `mod66363.TK` is a `React.memo` object whose `.type` property is `{ writable: true, configurable: true }`, located dynamically via the module exporting `BHasVerticalCapsule`.
  - Wrapping `capsuleMemo.type` passes `sortByType: 1` to `origCapsuleType` when `settings.lastUsedMetric` is active and `props.context === 1` (`InCollection`) so Steam suppresses its native `Last Played` date subscript, and clones the returned VDOM via `React.cloneElement` to insert `<div className={subscriptClass}>{metricText}</div>`.
  - Because the badge is rendered inside React's Virtual DOM using Steam's native `LibraryItemBoxSubscript` class, it tracks virtualized grid scrolling and 3D hover transforms with zero flicker.
