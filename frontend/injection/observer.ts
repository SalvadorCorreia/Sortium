import { log, logError } from '../services/logger';
import { logSelectorMatches, findSortInjectionTarget } from './targets';
import { injectSortiumStyles, removeSortiumStyles } from '../styles/injectStyles';

const ROOT_ID = 'sortium-root';

export interface SortiumObserverController {
  cleanup(): void;
  forceReinject(reason?: string): void;
  removeInjected(reason?: string): void;
  logSelectors(): void;
  getState(): { hasRoot: boolean; lastSelector: string | null };
}

function removeDuplicateRoots(doc: Document, keep: HTMLElement | null) {
  const roots = Array.from(doc.querySelectorAll(`#${ROOT_ID}`)).filter((node): node is HTMLElement => node instanceof HTMLElement);
  for (const root of roots) {
    if (keep && root === keep) {
      continue;
    }

    root.remove();
  }
}

function removeSortiumRoot(doc: Document, reason: string) {
  const root = doc.getElementById(ROOT_ID);
  if (!(root instanceof HTMLElement)) {
    return;
  }

  root.remove();
  log(`Removed Sortium root (${reason}).`);
}

function ensureSortiumRoot(doc: Document, nativeSortContainer: HTMLElement): HTMLElement | null {
  const parent = nativeSortContainer.parentElement;
  if (!(parent instanceof HTMLElement)) {
    return null;
  }

  let root = doc.getElementById(ROOT_ID);
  if (!(root instanceof HTMLElement)) {
    root = doc.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('data-sortium-mounted', 'true');
  }

  // Steam frequently replaces header fragments; check both parent and sibling to keep sidecar placement stable.
  if (root.parentElement !== parent || root.previousElementSibling !== nativeSortContainer) {
    root.remove();
    parent.insertBefore(root, nativeSortContainer.nextSibling);
  }

  removeDuplicateRoots(doc, root);
  return root;
}

export function setupSortiumObserver(doc: Document): SortiumObserverController {
  injectSortiumStyles(doc);
  let observer: MutationObserver | null = null;
  let disposed = false;
  // Coalesces frequent observer events into one microtask-run injection attempt.
  let mutationQueued = false;
  // Prevents re-entrant injection while a previous reconciliation is still running.
  let isInjecting = false;
  let lastSelector: string | null = null;

  const runInjection = (reason: string) => {
    if (disposed || isInjecting) {
      return;
    }

    isInjecting = true;
    try {
      const target = findSortInjectionTarget(doc);
      if (!target) {
        removeSortiumRoot(doc, `${reason}:target-missing`);
        return;
      }

      const root = ensureSortiumRoot(doc, target.nativeSortContainer);
      if (!root) {
        logError('Found native sort dropdown but could not determine parent for sidecar insertion.');
        return;
      }

      lastSelector = target.selectorUsed;
      
      // We no longer pass configuration options here; the UI handles it natively
      log(`Injected Sortium sidecar via selector "${target.selectorUsed}" (${reason}).`);
    } finally {
      isInjecting = false;
    }
  };

  const queueInjection = (reason: string) => {
    if (mutationQueued) {
      return;
    }

    mutationQueued = true;
    queueMicrotask(() => {
      mutationQueued = false;
      runInjection(reason);
    });
  };

  observer = new MutationObserver(() => {
    queueInjection('mutation');
  });

  if (doc.body) {
    observer.observe(doc.body, { childList: true, subtree: true });
  }

  // Initial check ensures we inject even when no mutation is fired after hook registration.
  runInjection('initial');

  return {
    cleanup() {
      disposed = true;
      observer?.disconnect();
      observer = null;
      removeSortiumRoot(doc, 'cleanup');
      removeSortiumStyles(doc);
    },
    forceReinject(reason = 'manual') {
      removeSortiumRoot(doc, `force:${reason}`);
      runInjection(`force:${reason}`);
    },
    removeInjected(reason = 'manual') {
      removeSortiumRoot(doc, `manual-remove:${reason}`);
    },
    logSelectors() {
      logSelectorMatches(doc);
    },
    getState() {
      return {
        hasRoot: Boolean(doc.getElementById(ROOT_ID)),
        lastSelector,
      };
    },
  };
}
