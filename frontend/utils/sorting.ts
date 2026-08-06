import { getAvailableStreams } from '../services/settings';

export function getMetricValue(metric: string, data: any): number | null {
	if (!data) return null;

	if (data[metric] !== undefined && data[metric] !== null) {
		return data[metric];
	}

	const parts = metric.split('_');
	if (parts.length > 1) {
		parts.shift();
		const strippedKey = parts.join('_');

		if (data[strippedKey] !== undefined && data[strippedKey] !== null) {
			return data[strippedKey];
		}

		const keys = Object.keys(data);
		for (const key of keys) {
			if (key.toLowerCase().startsWith(strippedKey.toLowerCase())) {
				if (data[key] !== undefined && data[key] !== null) {
					return data[key];
				}
			}
		}
	}

	if (metric === 'hltb_main') return data.story ?? null;
	if (metric === 'hltb_main_extra' || metric === 'hltb_extras') return data.extras ?? null;
	if (metric === 'hltb_completionist') return data.complete ?? null;

	return null;
}

export function sortApps(appIds: number[], metricId: string, dataResolver: (appId: number) => any, direction: 'asc' | 'desc' = 'asc'): number[] {
	const getSortValue = (appId: number) => {
		const data = dataResolver(appId);
		const value = getMetricValue(metricId, data);
		if (value === null || value === undefined) {
			return direction === 'asc' ? Infinity : -Infinity;
		}
		return value;
	};

	return [...appIds].sort((a, b) => {
		const valA = getSortValue(a);
		const valB = getSortValue(b);

		if (valA === valB) return 0;
		return direction === 'asc' ? valA - valB : valB - valA;
	});
}

export function formatMetricValue(value: number | null, metricId: string, isMissing: boolean): string {
	if (isMissing) return 'Loading...';
	if (value === null || value === undefined || value === Infinity || value === -Infinity) return 'No data';

	let metricType: string = 'time';
	const streams = getAvailableStreams();
	for (const stream of streams) {
		const found = stream.metrics.find((m) => m.id === metricId);
		if (found) {
			metricType = found.type;
			break;
		}
	}

	switch (metricType) {
		case 'rating':
			return `${value.toFixed(1)}%`;
		case 'score':
			return `${Math.round(value).toLocaleString()} points`;
		case 'count':
			return `${Math.round(value).toLocaleString()} achievements`;
		case 'time':
		default:
			if (value < 120) {
				return `${Math.round(value)} mins`;
			}
			return `${(value / 60).toFixed(1)} hrs`;
	}
}
