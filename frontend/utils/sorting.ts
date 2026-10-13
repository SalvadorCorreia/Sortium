import { getAvailableStreams, type DataStream } from '../services/settings';
import type { AppState, LibrarySyncReport, SyncProgressReport } from '../services/queue';

/**
 * Resolves a specific metric value from a raw cache data object.
 * Returns the numeric value if found, handling fuzzy key matching, or null if missing.
 */
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

/**
 * Sorts an array of AppIDs based on a specified metric and direction.
 * Consumes a dataResolver callback to fetch cached data and returns a new sorted array.
 */
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

/**
 * Formats a raw metric number into a human-readable UI string (e.g., "12 hrs" or "85%").
 * Evaluates entry state to display "Loading..." or "No data" appropriately.
 */
export function formatMetricValue(value: number | null, metricId: string, state: AppState = 'CACHED'): string {
	if (state === 'ERROR_CACHE') return 'No data';
	if (state === 'MISSING' || state === 'BATCHING' || state === 'QUEUED' || state === 'FETCHING') return 'Loading...';
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

/**
 * Consumes a LibrarySyncReport and stream metadata, returning presentation-ready status text and color.
 */
export function formatSyncFeedback(
	report: LibrarySyncReport,
	streams: DataStream[]
): { text: string; color: string } {
	if (report.totalGames === 0) {
		return { text: 'No games found in library', color: '#ffc82c' };
	}

	const streamMap = new Map(streams.map((s) => [s.id, s.tag || s.name]));
	const streamIds = Object.keys(report.streamResults);

	if (report.totalQueued > 0) {
		const singleTag = streamIds[0] ? (streamMap.get(streamIds[0]) || streamIds[0]) : '';
		const details =
			streamIds.length > 1
				? ` (${streamIds.map((id) => `${streamMap.get(id) || id}: ${report.streamResults[id]?.queued || 0}`).join(', ')})`
				: ` (${singleTag})`;

		return {
			text: `✓ Queued ${report.totalQueued} games${details}`,
			color: '#a4d007',
		};
	}

	// Fix sequential click bug: items already queued and in-flight
	if (report.totalPending > 0) {
		const singleTag = streamIds[0] ? (streamMap.get(streamIds[0]) || streamIds[0]) : '';
		const details =
			streamIds.length > 1
				? ` (${streamIds.map((id) => `${streamMap.get(id) || id}: ${report.streamResults[id]?.pending || 0}`).join(', ')})`
				: ` (${singleTag})`;

		return {
			text: `⟳ Sync in progress: ${report.totalPending} pending${details}`,
			color: '#66c0f4',
		};
	}

	const streamTags = streamIds.map((id) => streamMap.get(id) || id);
	const label = streamTags.length > 0 ? ` (${streamTags.join(', ')})` : '';

	return {
		text: `✓ All ${report.totalGames} games up to date${label}`,
		color: '#8f98a0',
	};
}

/**
 * Consumes a real-time SyncProgressReport and stream metadata, returning progress text, theme color, and completion status.
 */
export function formatProgressFeedback(
	progress: SyncProgressReport,
	streams: DataStream[]
): { text: string; color: string; isComplete: boolean } {
	if (!progress.isRunning && progress.totalPending === 0) {
		return { text: '✓ All games up to date', color: '#8f98a0', isComplete: true };
	}

	const streamMap = new Map(streams.map((s) => [s.id, s.tag || s.name]));
	const streamIds = Object.keys(progress.streamProgress);

	if (progress.isRateLimited) {
		const limitedStream = streamIds.find((id) => progress.streamProgress[id]?.isRateLimited);
		const tag = limitedStream ? streamMap.get(limitedStream) || limitedStream : 'API';
		return {
			text: `⚠ Rate limited (${tag}) - ${progress.totalPending} left in queue`,
			color: '#ffc82c',
			isComplete: false,
		};
	}

	const completed = Math.max(0, progress.totalInitial - progress.totalPending);
	const percent = progress.totalInitial > 0 ? Math.floor((completed / progress.totalInitial) * 100) : 0;

	const breakdown =
		streamIds.length > 1
			? ` (${streamIds.map((id) => `${streamMap.get(id) || id}: ${progress.streamProgress[id]?.pending || 0}`).join(', ')})`
			: '';

	return {
		text: `⟳ Syncing: ${completed}/${progress.totalInitial} (${percent}%) - ${progress.totalPending} left${breakdown}`,
		color: '#66c0f4',
		isComplete: false,
	};
}
