import { callable } from '@steambrew/client';
import { logger, setLoggingEnabled } from './logger';

export interface Metric {
	id: string;
	name: string;
	type: 'time' | 'rating' | 'score' | 'count';
	defaultDir: 'asc' | 'desc';
}

export interface DataStream {
	id: string;
	name: string;
	tag: string;
	metrics: Metric[];
}

export interface PluginSettings {
	enabledStreams: Record<string, boolean>;
	enabledMetrics: Record<string, boolean>;
	sortDirection: 'asc' | 'desc';
	menuStyle: 'dropdown' | 'context';
	lastUsedMetric: string;
	sortiumViewActive: boolean;
	softCacheDays: number;
	hardCacheDays: number;
	enableLogging: boolean;
	enableLibraryButton: boolean;
	enableCollectionButton: boolean;
}

interface BackendResponse<T> {
	success: boolean;
	error?: string;
	data?: T;
}

const DEFAULT_SETTINGS: PluginSettings = {
	enabledStreams: {},
	enabledMetrics: {},
	sortDirection: 'asc',
	menuStyle: 'dropdown',
	lastUsedMetric: '',
	sortiumViewActive: false,
	softCacheDays: 4,
	hardCacheDays: 7,
	enableLogging: true,
	enableLibraryButton: true,
	enableCollectionButton: true,
};

const GetAvailableStreamsRpc = callable<[], string>('GetAvailableStreams');
const GetSettingsRpc = callable<[], string>('GetSettings');
const SaveSettingsRpc = callable<[{ settings_json: string }], string>('SaveSettings');
const ClearCacheRpc = callable<[], string>('ClearCache');

let cachedSettings: PluginSettings = { ...DEFAULT_SETTINGS };
let cachedStreams: DataStream[] = [];

export async function initSettings(): Promise<void> {
	try {
		const streamsJson = await GetAvailableStreamsRpc();
		if (streamsJson) {
			const res: BackendResponse<DataStream[]> = JSON.parse(streamsJson);
			if (res.success && res.data) {
				cachedStreams = res.data;
			} else {
				logger.warn('Failed to load data streams from backend:', res.error);
			}
		}

		const settingsJson = await GetSettingsRpc();
		if (settingsJson) {
			const res: BackendResponse<PluginSettings> = JSON.parse(settingsJson);
			if (res.success && res.data) {
				cachedSettings = { ...DEFAULT_SETTINGS, ...res.data };
				setLoggingEnabled(cachedSettings.enableLogging);
			} else {
				logger.warn('Failed to load settings from backend:', res.error);
			}
		}
	} catch (error) {
		logger.error('Initialization failure during IPC call:', error);
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

	setLoggingEnabled(settings.enableLogging);
	try {
		const payload = { settings_json: JSON.stringify(settings) };
		const responseJson = await SaveSettingsRpc(payload);

		if (!responseJson) {
			logger.warn('SaveSettingsRpc returned no response. Save aborted.');
			cachedSettings = previousSettings;
			return false;
		}

		const res: BackendResponse<void> = JSON.parse(responseJson);
		if (!res.success) {
			logger.error('Failed to save settings to disk:', res.error);
			cachedSettings = previousSettings;
			return false;
		}

		return true;
	} catch (error) {
		logger.error('Exception during settings save operation:', error);
		cachedSettings = previousSettings;
		return false;
	}
}

export async function clearCache(): Promise<boolean> {
	try {
		const responseJson = await ClearCacheRpc();
		if (!responseJson) return false;
		const res: BackendResponse<void> = JSON.parse(responseJson);
		return res.success;
	} catch (error) {
		logger.error('Failed to clear cache:', error);
		return false;
	}
}
