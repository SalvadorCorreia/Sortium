import type { SortiumObserverController } from '../injection/observer';
import { SORTIUM_ROOT_ID } from '../injection/constants';
import { createLogger } from '../services/logger';

const logger = createLogger('model-debug');

/**
 * Minimal, model-specific debugging for the *current* injection strategy.
 *
 * It answers only one question:
 *   "Why did Sortium fail to inject next to the Library 'Sort By' dropdown?"
 */

export type ModelFailureReason =
  | 'NO_HOST_WINDOW'
  | 'NO_DOCUMENT_BODY'
  | 'NOT_LIBRARY_SURFACE'
  | 'SORT_BY_LABEL_NOT_FOUND'
  | 'SORT_BY_CONTAINER_NOT_FOUND'
  | 'SORT_BY_DROPDOWN_NOT_FOUND'
  | 'TARGET_FOUND_BUT_ROOT_NOT_INSERTED'
  | 'ROOT_INSERTED_BUT_NOT_ADJACENT'
  | 'UNKNOWN';

export interface SortiumModelDebugReport {
  ts: number;
  ok: boolean;
  reason?: ModelFailureReason;

  // Environment
  title?: string;
  url?: string;

  // Library detection
  libraryRoot?: {
    found: boolean;
    token?: string;
    breadcrumb?: string;
  };

  // Sort By detection
  sortBy?: {
    labelFound: boolean;
    labelBreadcrumb?: string;
    containerBreadcrumb?: string;
    dropdownFound: boolean;
    dropdownBreadcrumb?: string;
  };

  // Injection reconciliation
  injectedRoot?: {
    exists: boolean;
    breadcrumb?: string;
    parentBreadcrumb?: string;
    prevSiblingBreadcrumb?: string;
    nextSiblingBreadcrumb?: string;
    adjacentToDropdown?: boolean;
  };
}

function safeLocation(doc: Document): { url?: string } {
  try {
    return { url: doc.defaultView?.location?.href };
  } catch {
    return {};
  }
}

/**
 * Small breadcrumb (avoids logging entire DOM nodes).
 * Example: div.Panel > div._DialogInputContainer > button...
 */
function breadcrumb(el: Element | null, maxDepth = 7): string {
  if (!el) return '(null)';
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;

  while (cur && depth < maxDepth) {
    const cls = (cur as HTMLElement).className;
    const clsToken = typeof cls === 'string' && cls.trim() ? `.${cls.trim().split(/\s+/)[0]}` : '';
    parts.push(`${cur.tagName.toLowerCase()}${clsToken}`);
    cur = cur.parentElement;
    depth++;
  }

  return parts.reverse().join(' > ');
}

const LIBRARY_ROOT_CLASS_PREFIX = 'LibraryDisplaySize';
const SORT_BY_LABEL_TEXT = 'Sort By';
const DROPDOWN_BUTTON_SELECTOR = 'button.DialogDropDown._DialogInputContainer[role="combobox"]';

function findLibraryRoot(doc: Document): { el: HTMLElement; token: string } | null {
  const all = Array.from(doc.querySelectorAll('*')).filter((n): n is HTMLElement => n instanceof HTMLElement);
  for (const el of all) {
    const token = Array.from(el.classList).find((c) => c.startsWith(LIBRARY_ROOT_CLASS_PREFIX));
    if (!token) continue;
    if (el.isConnected) return { el, token };
  }
  return null;
}

function findSortByLabel(libraryRoot: HTMLElement): HTMLElement | null {
  const nodes = Array.from(libraryRoot.querySelectorAll('*')).filter((n): n is HTMLElement => n instanceof HTMLElement);
  for (const el of nodes) {
    if ((el.textContent ?? '').trim() === SORT_BY_LABEL_TEXT) return el;
  }
  return null;
}

function findSortByDropdownFromLabel(label: HTMLElement): { container: HTMLElement; dropdown: HTMLElement } | null {
  const container = label.parentElement;
  if (!(container instanceof HTMLElement)) return null;

  const dropdown = container.querySelector(DROPDOWN_BUTTON_SELECTOR);
  if (dropdown instanceof HTMLElement) return { container, dropdown };

  // Fallback: sometimes label is nested one level deeper than expected
  const up = container.parentElement;
  if (up instanceof HTMLElement) {
    const dropdownUp = up.querySelector(DROPDOWN_BUTTON_SELECTOR);
    if (dropdownUp instanceof HTMLElement) return { container: up, dropdown: dropdownUp };
  }

  return null;
}

function buildReport(doc: Document, controller?: SortiumObserverController): SortiumModelDebugReport {
  const rep: SortiumModelDebugReport = {
    ts: Date.now(),
    ok: false,
    title: doc.title,
    ...safeLocation(doc),
  };

  if (!doc.body) {
    rep.reason = 'NO_DOCUMENT_BODY';
    return rep;
  }

  const lib = findLibraryRoot(doc);
  rep.libraryRoot = lib ? { found: true, token: lib.token, breadcrumb: breadcrumb(lib.el) } : { found: false };

  if (!lib) {
    rep.reason = 'NOT_LIBRARY_SURFACE';
    return rep;
  }

  const label = findSortByLabel(lib.el);
  rep.sortBy = {
    labelFound: Boolean(label),
    labelBreadcrumb: label ? breadcrumb(label) : undefined,
    dropdownFound: false,
  };

  if (!label) {
    rep.reason = 'SORT_BY_LABEL_NOT_FOUND';
    return rep;
  }

  const resolved = findSortByDropdownFromLabel(label);
  if (!resolved) {
    rep.sortBy.containerBreadcrumb = label.parentElement ? breadcrumb(label.parentElement) : undefined;
    rep.reason = 'SORT_BY_DROPDOWN_NOT_FOUND';
    return rep;
  }

  rep.sortBy.containerBreadcrumb = breadcrumb(resolved.container);
  rep.sortBy.dropdownFound = true;
  rep.sortBy.dropdownBreadcrumb = breadcrumb(resolved.dropdown);

  const root = doc.getElementById(SORTIUM_ROOT_ID);
  rep.injectedRoot = {
    exists: Boolean(root),
    breadcrumb: root ? breadcrumb(root) : undefined,
    parentBreadcrumb: root?.parentElement ? breadcrumb(root.parentElement) : undefined,
    prevSiblingBreadcrumb: root?.previousElementSibling ? breadcrumb(root.previousElementSibling) : undefined,
    nextSiblingBreadcrumb: root?.nextElementSibling ? breadcrumb(root.nextElementSibling) : undefined,
    adjacentToDropdown: root ? root.previousElementSibling === resolved.dropdown : false,
  };

  if (!root) {
    // Optional: attempt a reinject so you can immediately see if it recovers
    controller?.forceReinject('sortiumModelDebug.diagnose');
    rep.reason = 'TARGET_FOUND_BUT_ROOT_NOT_INSERTED';
    return rep;
  }

  if (root.previousElementSibling !== resolved.dropdown) {
    rep.reason = 'ROOT_INSERTED_BUT_NOT_ADJACENT';
    return rep;
  }

  rep.ok = true;
  rep.reason = undefined;
  return rep;
}

export interface SortiumModelDebugApi {
  /** Returns a compact report with an explicit failure reason. */
  diagnose(): SortiumModelDebugReport;

  /** Prints the diagnose() result and returns it. */
  print(): SortiumModelDebugReport;
}

declare global {
  interface Window {
    sortiumModelDebug?: SortiumModelDebugApi;
  }
}

export function exposeSortiumModelDebug(doc: Document, controller: SortiumObserverController): () => void {
  const w = doc.defaultView;
  if (!w) return () => undefined;

  const api: SortiumModelDebugApi = {
    diagnose: () => buildReport(doc, controller),
    print: () => {
      const rep = buildReport(doc, controller);
      if (rep.ok) logger.info('Model OK', rep);
      else logger.warn(`Model FAILED: ${rep.reason ?? 'UNKNOWN'}`, rep);
      return rep;
    },
  };

  w.sortiumModelDebug = api;
  logger.info('Model debug ready on window.sortiumModelDebug');

  return () => {
    if (w.sortiumModelDebug === api) {
      delete w.sortiumModelDebug;
      logger.info('Model debug removed from window.sortiumModelDebug');
    }
  };
}
