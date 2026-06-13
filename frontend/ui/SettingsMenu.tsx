import React, { useState, useEffect } from 'react';
import { 
    Field, 
    ToggleField, 
    DialogControlsSection, 
    DialogControlsSectionHeader 
} from '@steambrew/client';

import { 
    initSettings, 
    getSettings, 
    getAvailableStreams, 
    saveSettings, 
    type PluginSettings, 
    type DataStream 
} from '../services/settings';

/**
 * Renders the interactive settings interface for the Millennium plugin menu.
 * Consumes no props, manages internal configuration state asynchronously, and returns the React node for the settings view.
 */
export default function SettingsMenu() {
    const [settings, setSettingsState] = useState<PluginSettings | null>(null);
    const [streams, setStreams] = useState<DataStream[]>([]);

    useEffect(() => {
        let isMounted = true;
        
        // Bridging to the Lua backend via IPC is asynchronous, so we defer rendering the actual settings until the data is fully loaded.
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
        // Persist to Lua backend immediately to prevent state desync if the user closes the window quickly.
        await saveSettings(newSettings);
    };

    const toggleLogging = async (checked: boolean) => {
        const newSettings = { ...settings, enableLogging: checked };
        setSettingsState(newSettings);
        await saveSettings(newSettings);
    };

    const toggleLibraryButton = async (checked: boolean) => {
        const newSettings = { ...settings, enableLibraryButton: checked };
        setSettingsState(newSettings);
        await saveSettings(newSettings);
    };

    const toggleCollectionButton = async (checked: boolean) => {
        const newSettings = { ...settings, enableCollectionButton: checked };
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
                <DialogControlsSectionHeader>User Interface</DialogControlsSectionHeader>
                <div style={{ marginBottom: '16px', color: '#8f98a0', fontSize: '13px' }}>
                    Choose where the Sortium sorting button should be injected within Steam.
                </div>
                <ToggleField
                    label="Enable Library Button"
                    description="Show the sorting button on the main Library home page."
                    checked={settings.enableLibraryButton}
                    onChange={toggleLibraryButton}
                    bottomSeparator="standard"
                />
                <ToggleField
                    label="Enable Collection Button"
                    description="Show the sorting button inside individual Collections."
                    checked={settings.enableCollectionButton}
                    onChange={toggleCollectionButton}
                    bottomSeparator="standard"
                />
            </DialogControlsSection>

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
}
