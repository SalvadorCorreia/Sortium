import { createLogger } from '../services/logger';

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

const logger = createLogger('targets');

const HEADER_SELECTORS = [
'.libraryhome_LibraryHomeHeader_3QrM9',
'[class*="LibraryHomeHeader"]',
'[class*="libraryhome_LibraryHomeHeader"]',
'[class*="libraryhome_Container"] [class*="Header"]',
'.libraryhome_HeaderContainer',
];

const NATIVE_SORT_SELECTORS = [
'[class*="libraryhome_SortDropDown"]',
'[class*="SortDropDown"]',
'[class*="libraryhome_DropDown"]',
'[class*="DialogDropDown"]',
'[class*="LibraryHome"] [class*="Sort"] [class*="DropDown"]',
];

function describeNode(node: HTMLElement): string {
const classText = node.classList.length > 0 ? `.${Array.from(node.classList).join('.')}` : '';
return `${node.tagName.toLowerCase()}${classText}`;
}

function getElements(doc: Document, selector: string): HTMLElement[] {
return Array.from(doc.querySelectorAll(selector)).filter((node): node is HTMLElement => node instanceof HTMLElement);
}

function firstVisible(nodes: HTMLElement[]): HTMLElement | null {
for (const node of nodes) {
if (!node.isConnected) {
continue;
}

const rect = node.getBoundingClientRect();
if (rect.width > 0 && rect.height > 0) {
return node;
}
}

return null;
}

function selectorMatches(doc: Document, selectors: string[]): SelectorMatch[] {
return selectors.map((selector) => {
const nodes = getElements(doc, selector);
return {
selector,
count: nodes.length,
nodes: nodes.slice(0, 3).map(describeNode),
};
});
}

export function logSelectorMatches(doc: Document) {
const results = {
headers: selectorMatches(doc, HEADER_SELECTORS),
nativeSort: selectorMatches(doc, NATIVE_SORT_SELECTORS),
};

logger.info('Selector diagnostics', results);
return results;
}

export function findSortInjectionTarget(doc: Document): SortInjectionTarget | null {
for (const selector of NATIVE_SORT_SELECTORS) {
const nativeSortContainer = firstVisible(getElements(doc, selector));
if (!nativeSortContainer) {
continue;
}

const headerContainer = firstVisible(HEADER_SELECTORS.flatMap((headerSelector) => getElements(doc, headerSelector)));
const resolvedHeaderContainer = headerContainer ?? nativeSortContainer.parentElement;

if (!headerContainer) {
logger.info('Header selector fallback used native sort parent.');
}

if (resolvedHeaderContainer instanceof HTMLElement) {
return {
headerContainer: resolvedHeaderContainer,
nativeSortContainer,
selectorUsed: selector,
};
}
}

return null;
}
