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

/**
 * Directly fetches raw HLTB data for a single AppID from the public API.
 * Returns an error flag to prevent caching failed requests.
 */
export async function fetchHltbData(appId: string | number): Promise<{ data: HltbData | null; error: boolean }> {
	try {
		console.log(`[Sortium] Fetching HLTB data for AppID: ${appId}`);

		const response = await fetch(`https://api.augmentedsteam.com/app/${appId}/v2`);

		if (!response.ok) {
			console.error(`[Sortium] HTTP error ${response.status} for AppID: ${appId}`);
			return { data: null, error: true };
		}

		const json = (await response.json()) as AugmentedSteamResponse;
		return { data: json.hltb || null, error: false };
	} catch (error) {
		console.error(`[Sortium] Failed to fetch HLTB data for ${appId}:`, error);
		return { data: null, error: true };
	}
}

/**
 * Loops through an array of AppIDs, checking the Lua cache first,
 * fetching the missing ones in batches, and updating the backend cache.
 */
export async function fetchMultipleHltbData(appIds: (string | number)[]): Promise<Record<string, HltbData | null>> {
	const results: Record<string, HltbData | null> = {};
	const stringAppIds = appIds.map(String);

	const settings = getSettings();
	const cacheDays = settings.cacheDays ?? 7;

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
		if (entry && entry.expiry > nowSeconds) {
			results[id] = entry.data;
		} else {
			missingAppIds.push(id);
		}
	}

	if (missingAppIds.length > 0) {
		console.log(`[Sortium] Cache misses for ${missingAppIds.length} apps. Fetching sequentially...`);

		let newDataToCache: Record<string, CacheEntry> = {};
		let currentBatchCount = 0;

		// Fetch sequentially to prevent triggering WAF burst limits
		for (const [index, id] of missingAppIds.entries()) {
			const fetchResult = await fetchHltbData(id);
			results[id] = fetchResult.data;

			// Only prep successful fetches for the cache
			if (!fetchResult.error) {
				newDataToCache[id] = {
					data: fetchResult.data,
					expiry: nowSeconds + cacheExpirySeconds,
				};
				currentBatchCount++;
			}

			// INCREMENTAL SAVE: Save to disk every 20 successful fetches, OR if it's the very last item.
			// This guarantees progress is saved even if the API throws a 429 rate limit midway through.
			if (currentBatchCount >= 20 || index === missingAppIds.length - 1) {
				if (Object.keys(newDataToCache).length > 0) {
					try {
						const savePayload = { stream_id: 'hltb', new_data: newDataToCache };
						await appendToCache({ args_json: JSON.stringify(savePayload) });
						console.log(`[Sortium] Incrementally saved ${Object.keys(newDataToCache).length} entries to disk.`);

						// Wipe the temporary holding object for the next batch
						newDataToCache = {};
						currentBatchCount = 0;
					} catch (e) {
						console.error('[Sortium] Failed to incrementally save to backend cache:', e);
					}
				}
			}

			// Add a 150ms delay between individual requests (approx 6 requests per second)
			// Break the loop entirely if we hit a 429 to stop hammering the server
			if (fetchResult.error) {
				console.warn('[Sortium] Network error detected (likely 429). Halting further requests for this session to respect API limits.');
				break;
			} else if (index < missingAppIds.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 150));
			}
		}
	} else {
		console.log('[Sortium] All requested AppIDs were loaded straight from the backend cache!');
	}

	return results;
}
