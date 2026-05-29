import { Millennium, IconsModule, definePlugin, Field } from '@steambrew/client';
import { setupSortiumObserver, type SortiumObserverController } from './injection/observer';
import { exposeSortiumDebug } from './debug/tools';
import { createLogger } from './services/logger';

const logger = createLogger('index');

let activeDocument: Document | null = null;
let activeObserver: SortiumObserverController | null = null;
let removeDebugTools: (() => void) | null = null;

function cleanupActiveDocument() {
activeObserver?.cleanup();
activeObserver = null;
removeDebugTools?.();
removeDebugTools = null;
activeDocument = null;
}

function windowCreated(context: { m_strName?: string; m_popup?: { document?: Document } }) {
if (!context.m_strName?.startsWith('SP ')) {
return;
}

if (context.m_strName.includes('BPM')) {
logger.info(`Skipping Big Picture window: ${context.m_strName}`);
return;
}

const doc = context.m_popup?.document;
if (!doc?.body) {
return;
}

if (activeDocument === doc) {
return;
}

cleanupActiveDocument();
activeDocument = doc;
activeObserver = setupSortiumObserver(doc);
removeDebugTools = exposeSortiumDebug(doc, activeObserver);
logger.info(`Sortium observer attached to window: ${context.m_strName}`);
}

const SettingsContent = () => {
return <Field label="Sortium" description="Desktop-only sidecar dropdown injection is active when Steam Library header is detected." bottomSeparator="standard" focusable />;
};

export default definePlugin(() => {
Millennium.AddWindowCreateHook(windowCreated);

return {
title: 'Sortium',
icon: <IconsModule.Settings />,
content: <SettingsContent />,
onDismount() {
cleanupActiveDocument();
},
};
});
