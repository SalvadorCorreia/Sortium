import { SortiumDropdown } from './SortiumDropdown';
import type { SortiumDropdownOption } from '../services/streamConfig';
import { createLogger } from '../services/logger';

interface ReactRootLike {
render(node: unknown): void;
unmount?(): void;
}

interface LegacyReactDom {
createRoot?: (container: HTMLElement) => ReactRootLike;
render?: (node: unknown, container: HTMLElement) => void;
unmountComponentAtNode?: (container: HTMLElement) => void;
}

const logger = createLogger('mount');
const rootsByNode = new WeakMap<HTMLElement, ReactRootLike>();

function resolveReactDom(): LegacyReactDom | null {
if (!window.SP_REACTDOM) {
logger.error('window.SP_REACTDOM was not available, cannot mount UI.');
return null;
}

return window.SP_REACTDOM as LegacyReactDom;
}

export function mountSortiumDropdown(mountNode: HTMLElement, options: SortiumDropdownOption[]) {
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
render: (node: unknown) => {
reactDom.render?.(node, mountNode);
},
unmount: () => {
reactDom.unmountComponentAtNode?.(mountNode);
},
};
}

rootsByNode.set(mountNode, root);
}

root.render(<SortiumDropdown options={options} />);
}

export function unmountSortiumDropdown(mountNode: HTMLElement) {
const reactDom = resolveReactDom();
const root = rootsByNode.get(mountNode);

if (root?.unmount) {
root.unmount();
} else {
reactDom?.unmountComponentAtNode?.(mountNode);
}

rootsByNode.delete(mountNode);
}
