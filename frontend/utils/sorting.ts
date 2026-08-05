export function getMetricValue(metric: string, data: any): number | null {
	if (!data) return null;

	if (data[metric] !== undefined) return data[metric];

	const parts = metric.split('_');
	if (parts.length > 1) {
		parts.shift();
		const strippedKey = parts.join('_');
		if (data[strippedKey] !== undefined) return data[strippedKey];
	}

	if (metric === 'hltb_main') return data.story || null;
	if (metric === 'hltb_main_extra' || metric === 'hltb_extras') return data.extras || null;
	if (metric === 'hltb_completionist') return data.complete || null;

	return null;
}

export function sortApps(appIds: number[], metric: string, dataResolver: (appId: number) => any): number[] {
	const getSortValue = (appId: number) => {
		const data = dataResolver(appId);
		const value = getMetricValue(metric, data);
		return value !== null ? value : Infinity;
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
