import { callable } from '@steambrew/client';
import { getSettings } from './settings';

export interface HltbData {
	story: number | null;
	extras: number | null;
	complete: number | null;
	url: string;
}

interface AugmentedSteamResponse {
	hltb?: HltbData;
}

interface CacheEntry {
	data: HltbData | null;
	expiry: number;
}

const getCacheBatch = callable<[{ args_json: string }], string>('GetCacheBatch');
const appendToCache = callable<[{ args_json: string }], string>('AppendToCache');

export async function fetchHltbData(appId: string | number): Promise<HltbData | null> {
	try {
		console.log(`[Sortium] Fetching HLTB data for AppID: ${appId}`);

		const response = await fetch(`https://api.augmentedsteam.com/app/${appId}/v2`);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const json = (await response.json()) as AugmentedSteamResponse;
		return json.hltb || null;
	} catch (error) {
		console.error(`[Sortium] Failed to fetch HLTB data for ${appId}:`, error);
		return null;
	}
}

export async function fetchMultipleHltbData(appIds: (string | number)[]): Promise<Record<string, HltbData | null>> {
	const results: Record<string, HltbData | null> = {};
	const stringAppIds = appIds.map(String);

	const settings = getSettings();
	const cacheDays = settings.cacheDays ?? 7;

	// 1. Convert everything to SECONDS instead of milliseconds
	const cacheExpirySeconds = cacheDays * 24 * 60 * 60;
	const nowSeconds = Math.floor(Date.now() / 1000);

	let cachedData: Record<string, CacheEntry> = {};
	try {
		const payload = { stream_id: 'hltb', app_ids: stringAppIds };
		const rawResponse = await getCacheBatch({ args_json: JSON.stringify(payload) });

		const parsedResponse = JSON.parse(rawResponse);
		if (parsedResponse.success && parsedResponse.data) {
			cachedData = parsedResponse.data;
		}
	} catch (e) {
		console.error('[Sortium] Failed to read from backend cache:', e);
	}

	const missingAppIds: string[] = [];

	for (const id of stringAppIds) {
		const entry = cachedData[id];
		// 2. Check against the current time in SECONDS
		if (entry && entry.expiry > nowSeconds) {
			results[id] = entry.data;
		} else {
			missingAppIds.push(id);
		}
	}

	if (missingAppIds.length > 0) {
		console.log(`[Sortium] Cache misses for ${missingAppIds.length} apps. Fetching from API...`);
		const newDataToCache: Record<string, CacheEntry> = {};

		const promises = missingAppIds.map(async (id) => {
			const fetchedData = await fetchHltbData(id);
			results[id] = fetchedData;

			newDataToCache[id] = {
				data: fetchedData,
				// 3. Save the new expiry timestamp in SECONDS
				expiry: nowSeconds + cacheExpirySeconds,
			};
		});

		await Promise.all(promises);

		try {
			const savePayload = { stream_id: 'hltb', new_data: newDataToCache };
			await appendToCache({ args_json: JSON.stringify(savePayload) });

			console.log(`[Sortium] Successfully updated backend cache with ${missingAppIds.length} new entries.`);
		} catch (e) {
			console.error('[Sortium] Failed to save to backend cache:', e);
		}
	} else {
		console.log('[Sortium] All requested AppIDs were loaded straight from the backend cache!');
	}

	return results;
}
