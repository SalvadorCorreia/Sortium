import React, { useState, useEffect } from 'react';
import { 
  Millennium, 
  IconsModule, 
  definePlugin, 
  Field, 
  ToggleField, 
  DialogControlsSection, 
  DialogControlsSectionHeader 
} from '@steambrew/client';

import { setupSortiumObserver, type SortiumObserverController } from './injection/observer';
import { exposeSortiumDebug } from './debug/tools';
import { exposeSortiumModelDebug } from './debug/modelDebug';
import { log } from './services/logger';

import { 
  initSettings, 
  getSettings, 
  getAvailableStreams, 
  saveSettings, 
  type PluginSettings, 
  type DataStream 
} from './services/settings';

// ==============================================================================
// Window Hooking & Observer Logic
// ==============================================================================

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

// ==============================================================================
// Native Settings UI
// ==============================================================================

const SettingsContent = () => {
  const [settings, setSettingsState] = useState<PluginSettings | null>(null);
  const [streams, setStreams] = useState<DataStream[]>([]);

  useEffect(() => {
    let isMounted = true;
    
    // Initialize IPC bridge and load data from Lua
    initSettings().then(() => {
      if (isMounted) {
        setSettingsState(getSettings());
        setStreams(getAvailableStreams());
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!settings) {
    return <Field label="Loading Sortium Configuration..." />;
  }

  // Event Handlers
  const toggleStream = async (streamId: string, checked: boolean) => {
    const newSettings = {
      ...settings,
      enabledStreams: { ...settings.enabledStreams, [streamId]: checked },
    };
    setSettingsState(newSettings);
    await saveSettings(newSettings);
  };

  const toggleLogging = async (checked: boolean) => {
    const newSettings = { ...settings, enableLogging: checked };
    setSettingsState(newSettings);
    await saveSettings(newSettings);
  };

  const updateCacheDays = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0) {
      const newSettings = { ...settings, cacheDays: val };
      setSettingsState(newSettings);
      await saveSettings(newSettings);
    }
  };

  return (
    <>
      <DialogControlsSection>
        <DialogControlsSectionHeader>Data Streams</DialogControlsSectionHeader>
        <div style={{ marginBottom: '16px', color: '#8f98a0', fontSize: '13px' }}>
          Select which data sources to use. Enabled streams and their sorting metrics will appear in your Library sorting dropdown.
        </div>
        
        {streams.map((stream) => (
          <ToggleField
            key={stream.id}
            label={stream.name}
            checked={!!settings.enabledStreams[stream.id]}
            onChange={(checked) => toggleStream(stream.id, checked)}
            bottomSeparator="standard"
          />
        ))}
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>Configuration</DialogControlsSectionHeader>
        <Field 
          label="Cache Expiration (Days)" 
          description="How long to store fetched game data locally before pinging the APIs again." 
          bottomSeparator="standard"
        >
          <input
            type="number"
            min="1"
            value={settings.cacheDays}
            onChange={updateCacheDays}
            style={{ 
              width: '60px', 
              padding: '6px 8px', 
              background: 'rgba(0, 0, 0, 0.25)', 
              color: 'white', 
              border: '1px solid rgba(255, 255, 255, 0.1)', 
              borderRadius: '4px',
              outline: 'none'
            }}
          />
        </Field>
        <ToggleField
          label="Enable Developer Logging"
          description="Print debug information to the Millennium developer console."
          checked={settings.enableLogging}
          onChange={toggleLogging}
          bottomSeparator="standard"
        />
      </DialogControlsSection>

      <DialogControlsSection>
        <DialogControlsSectionHeader>Debug Status</DialogControlsSectionHeader>
        <Field 
          label="Last Used Metric" 
          description={settings.lastUsedMetric || "None"} 
          bottomSeparator="none" 
        />
      </DialogControlsSection>
    </>
  );
};

// ==============================================================================
// Plugin Registration
// ==============================================================================

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
