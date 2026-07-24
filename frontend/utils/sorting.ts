import { fetchMultipleHltbData } from '../services/hltb';
import { logger } from '../services/logger';

export async function fetchAndSortApps(appIds: number[], metric: string) {
	logger.info(`Fetching data and sorting ${appIds.length} games by ${metric}...`);
	const results = await fetchMultipleHltbData(appIds);

	const getSortValue = (appId: string | number) => {
		const data = results[appId];
		if (!data) return Infinity;

		switch (metric) {
			case 'hltb_main':
				return data.story || Infinity;
			case 'hltb_extras':
				return data.extras || Infinity;
			case 'hltb_completionist':
				return data.complete || Infinity;
			default:
				return Infinity;
		}
	};

	const sortedIds = [...appIds].sort((a, b) => getSortValue(a) - getSortValue(b));

	return { sortedIds, results, getSortValue };
}

export function formatTime(totalMinutes: number): string {
	if (totalMinutes === Infinity || !totalMinutes) return 'No data';

	const hours = Math.floor(totalMinutes / 60);
	const minutes = Math.round(totalMinutes % 60);

	if (hours === 0) return `${minutes}m`;
	return `${hours}h ${minutes}m`;
}
