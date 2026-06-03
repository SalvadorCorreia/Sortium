import { log, logError } from '../services/logger';

export interface SelectorMatch {
  selector: string;
  count: number;
  nodes: string[];
}

export interface SortInjectionTarget {
  headerContainer: HTMLElement;
  nativeSortContainer: HTMLElement;
  selectorUsed: string;
}

/**
 * Steam Desktop runs multiple UI documents/surfaces. We ONLY want the Library surface.
 * In current Steam builds, the Library root includes a stable class token like:
 * - LibraryDisplaySizeSmall
 * - LibraryDisplaySizeLarge
 * (The other hashed class token will change frequently.)
 */
const LIBRARY_ROOT_CLASS_PREFIX = 'LibraryDisplaySize';

/** Exact label text (English-only MVP). */
const SORT_BY_LABEL_TEXT = 'Sort By';

/**
 * Utility selector used for the native dropdown button.
 * These class names tend to be more stable than the fully-hashed module class names.
 */
const DROPDOWN_BUTTON_SELECTOR = 'button.DialogDropDown._DialogInputContainer[role="combobox"]';

function describeNode(node: HTMLElement): string {
  const classText = node.classList.length > 0 ? `.${Array.from(node.classList).join('.')}` : '';
  return `${node.tagName.toLowerCase()}${classText}`;
}

function getElements(root: ParentNode, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll(selector)).filter((node): node is HTMLElement => node instanceof HTMLElement);
}

function firstVisible(nodes: HTMLElement[]): HTMLElement | null {
  for (const node of nodes) {
    if (!node.isConnected) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return node;
  }
  return null;
}

function hasClassTokenStartingWith(el: Element, prefix: string): boolean {
  for (const cls of Array.from(el.classList)) {
    if (cls.startsWith(prefix)) return true;
  }
  return false;
}

function findLibraryRoot(doc: Document): HTMLElement | null {
  // Scan all elements and find the first *visible* element that has a LibraryDisplaySize* token.
  // This is intentionally a bit broad to avoid depending on hashed container classnames.
  const candidates = Array.from(doc.querySelectorAll('*')).filter((n): n is HTMLElement => n instanceof HTMLElement);
  const matches = candidates.filter((el) => hasClassTokenStartingWith(el, LIBRARY_ROOT_CLASS_PREFIX));
  const visible = firstVisible(matches);
  if (!visible && matches.length > 0) {
    // If we found matches but none are "visible" by our check, return the first connected one.
    // Steam sometimes briefly reports 0x0 during layout.
    const connected = matches.find((m) => m.isConnected) ?? null;
    return connected;
  }
  return visible;
}

function includesExactText(el: Element, expected: string): boolean {
  const text = (el.textContent ?? '').trim();
  return text === expected;
}

function findSortByDropdownWithin(libraryRoot: HTMLElement): { button: HTMLElement; panel: HTMLElement } | null {
  // Strategy: locate the label node that is exactly "Sort By", then find the nearest dropdown button
  // in the same container. Your HTML shows:
  //   <div class="..." tabindex="-1">
  //     <div class="...">Sort By</div>
  //     <button class="DialogDropDown _DialogInputContainer Focusable" role="combobox">...
  //   </div>
  // We avoid hashed classes and instead rely on:
  //   - label text node "Sort By" (English-only MVP)
  //   - button.DialogDropDown._DialogInputContainer[role=combobox]

  // Find all elements whose *trimmed* text is exactly "Sort By".
  const labelNodes = Array.from(libraryRoot.querySelectorAll('*')).filter((n): n is HTMLElement => n instanceof HTMLElement);
  const sortByLabels = labelNodes.filter((el) => includesExactText(el, SORT_BY_LABEL_TEXT));

  for (const label of sortByLabels) {
    // Prefer the parent container that likely holds the label + dropdown button.
    const container = label.parentElement;
    if (!(container instanceof HTMLElement)) continue;

    const dropdown = container.querySelector(DROPDOWN_BUTTON_SELECTOR);
    if (dropdown instanceof HTMLElement) {
      return { button: dropdown, panel: container };
    }

    // Fallback: look one level up (Steam sometimes nests the label).
    const up = container.parentElement;
    if (up instanceof HTMLElement) {
      const dropdownUp = up.querySelector(DROPDOWN_BUTTON_SELECTOR);
      if (dropdownUp instanceof HTMLElement) {
        return { button: dropdownUp, panel: up };
      }
    }
  }

  // Fallback strategy: if label-based matching fails (e.g. Steam A/B test), attempt heuristic:
  // pick the first visible dropdown button inside library root.
  const allDropdowns = getElements(libraryRoot, DROPDOWN_BUTTON_SELECTOR);
  const visible = firstVisible(allDropdowns);
  if (visible) {
    logError('Sort By label not found; falling back to first visible dropdown button. This may be incorrect.');
    const panel = visible.parentElement instanceof HTMLElement ? visible.parentElement : libraryRoot;
    return { button: visible, panel };
  }

  return null;
}

export function logSelectorMatches(doc: Document) {
  const libraryRoot = findLibraryRoot(doc);
  const rootInfo = libraryRoot
    ? { found: true, node: describeNode(libraryRoot), classes: Array.from(libraryRoot.classList).slice(0, 8) }
    : { found: false };

  const sortBy = libraryRoot ? findSortByDropdownWithin(libraryRoot) : null;
  const sortByInfo = sortBy
    ? { found: true, dropdown: describeNode(sortBy.button), panel: describeNode(sortBy.panel) }
    : { found: false };

  const results = {
    libraryRoot: rootInfo,
    sortBy: sortByInfo,
  };

  log('Selector diagnostics', results);
  return results;
}

export function findSortInjectionTarget(doc: Document): SortInjectionTarget | null {
  const libraryRoot = findLibraryRoot(doc);
  if (!libraryRoot) {
    // Not the Library surface (e.g., Welcome to Steam store/community/profile tab).
    return null;
  }

  const sortBy = findSortByDropdownWithin(libraryRoot);
  if (!sortBy) {
    return null;
  }

  return {
    headerContainer: sortBy.panel,
    nativeSortContainer: sortBy.button,
    selectorUsed: 'libraryRoot(LibraryDisplaySize*) + label("Sort By") + button.DialogDropDown._DialogInputContainer[role=combobox]',
  };
}
