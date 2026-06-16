import { callable } from '@steambrew/client';

// ==============================================================================
// Type Definitions
// ==============================================================================

export interface Metric {
	id: string;
	name: string;
}

export interface DataStream {
	id: string;
	name: string;
	metrics: Metric[];
}

export interface PluginSettings {
	enabledStreams: Record<string, boolean>;
	lastUsedMetric: string;
	cacheDays: number;
	enableLogging: boolean;
	enableLibraryButton: boolean;
	enableCollectionButton: boolean;
}

interface BackendResponse<T> {
	success: boolean;
	error?: string;
	data?: T;
}

// ==============================================================================
// Constants & State
// ==============================================================================

const DEFAULT_SETTINGS: PluginSettings = {
	enabledStreams: {
		hltb: true,
		sh: true,
	},
	lastUsedMetric: 'hltb_main',
	cacheDays: 7,
	enableLogging: true,
	enableLibraryButton: true,
	enableCollectionButton: true,
};

const GetAvailableStreamsRpc = callable<[], string>('GetAvailableStreams');
const GetSettingsRpc = callable<[], string>('GetSettings');
const SaveSettingsRpc = callable<[{ settings_json: string }], string>('SaveSettings');

let cachedSettings: PluginSettings = { ...DEFAULT_SETTINGS };
let cachedStreams: DataStream[] = [];

// ==============================================================================
// Service Methods
// ==============================================================================

export async function initSettings(): Promise<void> {
	try {
		const streamsJson = await GetAvailableStreamsRpc();
		if (streamsJson) {
			const res: BackendResponse<DataStream[]> = JSON.parse(streamsJson);
			if (res.success && res.data) {
				cachedStreams = res.data;
			}
		}

		const settingsJson = await GetSettingsRpc();
		if (settingsJson) {
			const res: BackendResponse<PluginSettings> = JSON.parse(settingsJson);
			if (res.success && res.data) {
				cachedSettings = { ...DEFAULT_SETTINGS, ...res.data };
			}
		}
	} catch (error) {
		console.error('[Sortium] Initialization failure:', error);
	}
}

export function getSettings(): PluginSettings {
	return cachedSettings;
}

export function getAvailableStreams(): DataStream[] {
	return cachedStreams;
}

export async function saveSettings(settings: PluginSettings): Promise<boolean> {
	const previousSettings = cachedSettings;
	cachedSettings = settings;

	try {
		const payload = { settings_json: JSON.stringify(settings) };
		const responseJson = await SaveSettingsRpc(payload);
		if (!responseJson) {
			cachedSettings = previousSettings;
			return false;
		}

		const res: BackendResponse<void> = JSON.parse(responseJson);
		if (!res.success) {
			console.error('[Sortium] Failed to save settings to disk:', res.error);
			cachedSettings = previousSettings;
			return false;
		}

		return true;
	} catch (error) {
		console.error('[Sortium] Exception during settings save operation:', error);
		cachedSettings = previousSettings;
		return false;
	}
}
