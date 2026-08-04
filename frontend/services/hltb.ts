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
