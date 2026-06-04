import type { SortiumObserverController } from '../injection/observer';
import { logSelectorMatches, findSortInjectionTarget } from '../injection/targets';
import { log, logError } from '../services/logger';

const ROOT_ID = 'sortium-root';

type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

export type SortiumDebugEvent =
  | { ts: number; level: DebugLevel; type: 'init'; message: string }
  | { ts: number; level: DebugLevel; type: 'action'; action: string; meta?: unknown }
  | { ts: number; level: DebugLevel; type: 'probe'; report: SortiumProbeReport }
  | { ts: number; level: DebugLevel; type: 'exception'; where: string; error: unknown };

export interface SortiumProbeReport {
  ts: number;

  // Basic environment info
  title: string;
  url?: string;
  pathname?: string;

  // Selector resolution
  targetFound: boolean;
  selectorUsed: string | null;
  nativeSortContainer?: {
    tag: string;
    className: string;
    breadcrumb: string;
  };

  // Root state
  root: {
    exists: boolean;
    breadcrumb?: string;
    parentBreadcrumb?: string;
    previousSiblingBreadcrumb?: string;
    nextSiblingBreadcrumb?: string;
  };
}

/**
 * Small, stable breadcrumb (avoids printing entire DOM nodes in logs).
 * Example: div.Panel > div._DialogInputContainer > button...
 */
function breadcrumb(el: Element | null, maxDepth = 6): string {
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

function safeGetLocation(doc: Document): { url?: string; pathname?: string } {
  try {
    const w = doc.defaultView;
    if (!w) return {};
    return { url: w.location?.href, pathname: w.location?.pathname };
  } catch {
    return {};
  }
}

export interface SortiumDebugApi {
  /** Ring buffer of recent debug events */
  events: SortiumDebugEvent[];

  /** Adjust how much we print to console (does not affect events buffer) */
  verbose: boolean;

  /** Dump current state (from controller + probe report) */
  probe(): SortiumProbeReport;

  /** Existing helpers */
  inspectSelectors(): ReturnType<typeof logSelectorMatches>;
  forceReinject(): void;
  removeInjected(): void;
  logState(): ReturnType<SortiumObserverController['getState']>;

  /** Clear internal debug event buffer */
  clearEvents(): void;

  /** Start/stop periodic probe logging (useful during navigation) */
  startWatch(intervalMs?: number): void;
  stopWatch(): void;
}

declare global {
  interface Window {
    sortiumDebug?: SortiumDebugApi;
  }
}

function pushEvent(api: SortiumDebugApi, evt: SortiumDebugEvent, max = 200) {
  api.events.push(evt);
  if (api.events.length > max) api.events.splice(0, api.events.length - max);
}

export function exposeSortiumDebug(doc: Document, controller: SortiumObserverController): () => void {
  const hostWindow = doc.defaultView;
  if (!hostWindow) return () => undefined;

  let watchTimer: number | null = null;

  const debugApi: SortiumDebugApi = {
    events: [],
    verbose: true,

    probe: () => {
      const { url, pathname } = safeGetLocation(doc);

      let selectorUsed: string | null = null;
      let nativeSortContainer: HTMLElement | null = null;

      try {
        const target = findSortInjectionTarget(doc);
        if (target) {
          selectorUsed = target.selectorUsed;
          nativeSortContainer = target.nativeSortContainer;
        }
      } catch (e) {
        // target finder should never throw; if it does, log it
        pushEvent(debugApi, { ts: Date.now(), level: 'error', type: 'exception', where: 'findSortInjectionTarget', error: e });
      }

      const root = doc.getElementById(ROOT_ID);

      const report: SortiumProbeReport = {
        ts: Date.now(),
        title: doc.title,
        url,
        pathname,
        targetFound: Boolean(nativeSortContainer),
        selectorUsed,
        nativeSortContainer: nativeSortContainer
          ? {
              tag: nativeSortContainer.tagName.toLowerCase(),
              className: nativeSortContainer.className,
              breadcrumb: breadcrumb(nativeSortContainer),
            }
          : undefined,
        root: {
          exists: Boolean(root),
          breadcrumb: root ? breadcrumb(root) : undefined,
          parentBreadcrumb: root?.parentElement ? breadcrumb(root.parentElement) : undefined,
          previousSiblingBreadcrumb: root?.previousElementSibling ? breadcrumb(root.previousElementSibling) : undefined,
          nextSiblingBreadcrumb: root?.nextElementSibling ? breadcrumb(root.nextElementSibling) : undefined,
        },
      };

pushEvent(debugApi, { ts: Date.now(), level: 'info', type: 'probe', report });
      if (debugApi.verbose) log('Probe report', report);
      return report;
    },

    inspectSelectors: () => logSelectorMatches(doc),
    forceReinject: () => controller.forceReinject(),
    removeInjected: () => controller.removeInjected(),
    logState: () => controller.getState(),
    clearEvents: () => { debugApi.events = []; },
    startWatch: (intervalMs = 2000) => {
      if (watchTimer) clearInterval(watchTimer);
      watchTimer = window.setInterval(() => debugApi.probe(), intervalMs);
    },
    stopWatch: () => {
      if (watchTimer) clearInterval(watchTimer);
      watchTimer = null;
    }
  };

  // Expose to window
  if (hostWindow) hostWindow.sortiumDebug = debugApi;

  return () => {
    debugApi.stopWatch();
    if (hostWindow) delete hostWindow.sortiumDebug;
  };
}
