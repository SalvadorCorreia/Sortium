export interface HltbData {
  story: number | null;    // Time in minutes
  extras: number | null;   // Time in minutes
  complete: number | null; // Time in minutes
  url: string;
}

interface AugmentedSteamResponse {
  hltb?: HltbData;
}

/**
 * Directly fetches raw HLTB data for a single AppID from the public API.
 */
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

/**
 * Loops through an array of AppIDs and fetches their data one by one.
 */
export async function fetchMultipleHltbData(appIds: (string | number)[]): Promise<Record<string, HltbData | null>> {
  const results: Record<string, HltbData | null> = {};
  
  // We resolve them together to keep it fast
  const promises = appIds.map(async (id) => {
    results[id] = await fetchHltbData(id);
  });
  
  await Promise.all(promises);
  return results;
}
