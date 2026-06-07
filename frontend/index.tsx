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

let activeObserver: SortiumObserverController | null = null;

function cleanupObserver() {
  activeObserver?.cleanup();
  activeObserver = null;
}

async function windowCreated(popup: any) {
  // We only care about the main desktop window, just like steam-easygrid
  if (popup.m_strName === "SP Desktop_uid0") {
    console.log('[Sortium] Main window created. Initializing observer...');
    
    // Clean up any existing observer just in case
    cleanupObserver();
    
    // Pass the popup object to our new observer architecture
    activeObserver = setupSortiumObserver(popup);
  }
}

// ==============================================================================
// Native Settings UI (Unchanged)
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
  console.log('[Sortium] Frontend plugin registered.');
  Millennium.AddWindowCreateHook(windowCreated);

  return {
    title: 'Sortium',
    icon: <IconsModule.Settings />,
    content: <SettingsContent />,
    onDismount() {
      cleanupObserver();
    },
  };
});
