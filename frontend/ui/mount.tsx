import { SortiumDropdown } from './SortiumDropdown';
import { logError } from '../services/logger';
import type { ReactNode } from 'react';

interface ReactRootLike {
  render(node: ReactNode): void;
  unmount?(): void;
}

interface LegacyReactDom {
  createRoot?: (container: HTMLElement) => ReactRootLike;
  render?: (node: ReactNode, container: HTMLElement) => void;
  unmountComponentAtNode?: (container: HTMLElement) => void;
}

const rootsByNode = new WeakMap<HTMLElement, ReactRootLike>();
const legacyRenderedNodes = new WeakSet<HTMLElement>();

function resolveReactDom(): LegacyReactDom | null {
  if (!window.SP_REACTDOM) {
    logError('window.SP_REACTDOM was not available, cannot mount UI.');
    return null;
  }
  return window.SP_REACTDOM as LegacyReactDom;
}

export function mountSortiumDropdown(mountNode: HTMLElement) {
  const reactDom = resolveReactDom();
  if (!reactDom) {
    return;
  }

  let root = rootsByNode.get(mountNode);

  if (!root) {
    if (typeof reactDom.createRoot === 'function') {
      root = reactDom.createRoot(mountNode);
    } else {
      root = {
        render: (node: ReactNode) => {
          reactDom.render?.(node, mountNode);
          legacyRenderedNodes.add(mountNode);
        },
        unmount: () => {
          if (legacyRenderedNodes.has(mountNode)) {
            reactDom.unmountComponentAtNode?.(mountNode);
            legacyRenderedNodes.delete(mountNode);
          }
        },
      };
    }
    rootsByNode.set(mountNode, root);
  }

  root.render(<SortiumDropdown />);
}

export function unmountSortiumDropdown(mountNode: HTMLElement) {
  const reactDom = resolveReactDom();
  const root = rootsByNode.get(mountNode);

  if (root?.unmount) {
    root.unmount();
  } else if (legacyRenderedNodes.has(mountNode)) {
    reactDom?.unmountComponentAtNode?.(mountNode);
    legacyRenderedNodes.delete(mountNode);
  }

  rootsByNode.delete(mountNode);
}
