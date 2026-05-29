import type { SortiumObserverController } from '../injection/observer';
import { logSelectorMatches } from '../injection/targets';
import { createLogger } from '../services/logger';

const logger = createLogger('debug');

export interface SortiumDebugApi {
inspectSelectors(): ReturnType<typeof logSelectorMatches>;
forceReinject(): void;
removeInjected(): void;
logState(): ReturnType<SortiumObserverController['getState']>;
}

declare global {
interface Window {
sortiumDebug?: SortiumDebugApi;
}
}

export function exposeSortiumDebug(doc: Document, controller: SortiumObserverController): () => void {
const hostWindow = doc.defaultView;
if (!hostWindow) {
return () => undefined;
}

const debugApi: SortiumDebugApi = {
// Use in Steam DevTools: window.sortiumDebug.inspectSelectors()
inspectSelectors: () => logSelectorMatches(doc),
forceReinject: () => controller.forceReinject('window.sortiumDebug'),
removeInjected: () => controller.removeInjected('window.sortiumDebug'),
logState: () => {
const state = controller.getState();
logger.info('Current observer state', state);
return state;
},
};

hostWindow.sortiumDebug = debugApi;
logger.info('Debug tools ready on window.sortiumDebug');

return () => {
if (hostWindow.sortiumDebug === debugApi) {
delete hostWindow.sortiumDebug;
logger.info('Debug tools removed from window.sortiumDebug');
}
};
}
