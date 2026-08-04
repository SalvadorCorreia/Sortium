export function getMetricValue(metric: string, data: any): number | null {
	if (!data) return null;

	switch (metric) {
		case 'hltb_main':
			return data.story || null;
		case 'hltb_extras':
			return data.extras || null;
		case 'hltb_completionist':
			return data.complete || null;
		default:
			return null;
	}
}

export function sortApps(appIds: number[], metric: string, dataResolver: (appId: number) => any): number[] {
	const getSortValue = (appId: number) => {
		const data = dataResolver(appId);
		const value = getMetricValue(metric, data);
		return value !== null ? value : Infinity; // Push missing/null data to the bottom
	};

	return [...appIds].sort((a, b) => getSortValue(a) - getSortValue(b));
}

export function formatTime(totalMinutes: number | null, isMissing: boolean): string {
	if (isMissing) return 'Loading...';
	if (totalMinutes === null || totalMinutes === Infinity) return 'No data';

	if (totalMinutes < 120) {
		return `${Math.round(totalMinutes)} minutes`;
	}

	const hours = (totalMinutes / 60).toFixed(1);
	return `${hours} hours`;
}
