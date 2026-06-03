import { Millennium, IconsModule, definePlugin, Field } from '@steambrew/client';
import { setupSortiumObserver, type SortiumObserverController } from './injection/observer';
import { exposeSortiumDebug } from './debug/tools';
import { exposeSortiumModelDebug } from './debug/modelDebug';
import { log } from './services/logger';

let activeDocument: Document | null = null;
let activeObserver: SortiumObserverController | null = null;
let removeDebugTools: (() => void) | null = null;
let removeModelDebugTools: (() => void) | null = null;

function cleanupActiveDocument() {
  activeObserver?.cleanup();
  activeObserver = null;

  removeDebugTools?.();
  removeDebugTools = null;

  removeModelDebugTools?.();
  removeModelDebugTools = null;

  activeDocument = null;
}

function windowCreated(context: { m_strName?: string; m_popup?: { document?: Document } }) {
  if (!context.m_strName?.startsWith('SP ')) {
    return;
  }

  if (context.m_strName.includes('BPM')) {
    log(`Skipping Big Picture window: ${context.m_strName}`);
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

  // Existing (general) debug API
  removeDebugTools = exposeSortiumDebug(doc, activeObserver);

  // New (model-specific) debug API with explicit failure reasons
  removeModelDebugTools = exposeSortiumModelDebug(doc, activeObserver);

  log(`Sortium observer attached to window: ${context.m_strName}`);
}

const SettingsContent = () => {
  return (
    <Field
      label="Sortium"
      description="Desktop-only sidecar dropdown injection is active when Steam Library header is detected. Use DevTools: sortiumModelDebug.print()"
      bottomSeparator="standard"
      focusable
    />
  );
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
