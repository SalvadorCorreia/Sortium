import { callable } from '@steambrew/client';
import { getSettings } from './settings';
import { logger } from './logger';

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
		const response = await fetch(`https://api.augmentedsteam.com/app/${appId}/v2`);

		if (!response.ok) {
			logger.warn(`HTTP error ${response.status} when fetching HLTB data for AppID ${appId}`);
			return { data: null, error: true };
		}

		const json = (await response.json()) as AugmentedSteamResponse;
		return { data: json.hltb || null, error: false };
	} catch (error) {
		logger.error(`Failed to fetch HLTB data for AppID ${appId}:`, error);
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
		logger.error('Failed to read from backend cache:', e);
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
		logger.info(`Cache misses detected for ${missingAppIds.length} app(s). Fetching sequentially...`);

		let newDataToCache: Record<string, CacheEntry> = {};
		let currentBatchCount = 0;

		for (const [index, id] of missingAppIds.entries()) {
			const fetchResult = await fetchHltbData(id);
			results[id] = fetchResult.data;

			if (!fetchResult.error) {
				newDataToCache[id] = {
					data: fetchResult.data,
					expiry: nowSeconds + cacheExpirySeconds,
				};
				currentBatchCount++;
			}

			if (currentBatchCount >= 20 || index === missingAppIds.length - 1) {
				if (Object.keys(newDataToCache).length > 0) {
					try {
						const savePayload = { stream_id: 'hltb', new_data: newDataToCache };
						await appendToCache({ args_json: JSON.stringify(savePayload) });
						logger.info(`Incrementally cached ${Object.keys(newDataToCache).length} entries to disk.`);

						newDataToCache = {};
						currentBatchCount = 0;
					} catch (e) {
						logger.error('Failed to incrementally save to backend cache:', e);
					}
				}
			}

			if (fetchResult.error) {
				logger.warn('Network or rate limit error detected. Halting remaining requests for this session.');
				break;
			} else if (index < missingAppIds.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 150));
			}
		}
	} else {
		logger.info('All requested AppIDs loaded directly from local cache.');
	}

	return results;
}
