import { getAvailableStreams, getSettings, type DataStream } from '../services/settings';
import type { AppState, SyncProgressReport } from '../services/queue';

/**
 * Filters Steam's native SortingDropDown options and appends enabled custom Sortium stream metrics.
 * Consumes an array of native dropdown option objects and returns the combined, filtered options array.
 * Preserves the first native option as a fallback if all options are disabled to prevent UI crashes.
 */
export function filterNativeSortOptions(rgOptions: any[]): any[] {
	if (!Array.isArray(rgOptions) || rgOptions.length === 0) {
		return rgOptions;
	}

	const settings = getSettings();
	const streams = getAvailableStreams();
	const steamStream = streams.find((stream) => stream.id === 'steam');
	const isSteamStreamEnabled = settings.enabledStreams['steam'] !== false;

	const filteredNative = rgOptions
		.filter((opt) => {
			if (opt && typeof opt.data === 'number') {
				if (!isSteamStreamEnabled) return false;
				return settings.enabledMetrics[`steam_${opt.data}`] !== false;
			}
			return false;
		})
		.map((opt) => {
			const metric = steamStream?.metrics.find((m) => m.id === `steam_${opt.data}`);
			return {
				...opt,
				defaultDir: metric?.defaultDir || (opt.data === 1 ? 'asc' : 'desc'),
			};
		});

	const customOptions = streams
		.filter((stream) => !stream.native && settings.enabledStreams[stream.id] !== false)
		.flatMap((stream) =>
			stream.metrics
				.filter((metric) => settings.enabledMetrics[metric.id] !== false)
				.map((metric) => ({
					label: `[${stream.tag || stream.name}] ${metric.name}`,
					data: metric.id,
					defaultDir: metric.defaultDir,
				})),
		);

	const combined = [...filteredNative, ...customOptions];
	return combined.length > 0 ? combined : [rgOptions[0]];
}

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
 * Sorts an array of AppIDs or AppOverview objects based on a specified metric and direction.
 * Consumes a dataResolver callback to fetch cached data and returns a new sorted array.
 */
export function sortApps<T extends number | { appid: number }>(
	items: T[],
	metricId: string,
	dataResolver: (appId: number) => any,
	direction: 'asc' | 'desc' = 'desc',
): T[] {
	const getSortValue = (item: T) => {
		const appId = typeof item === 'number' ? item : item.appid;
		const data = dataResolver(appId);
		const value = getMetricValue(metricId, data);
		if (value === null || value === undefined) {
			return direction === 'asc' ? Infinity : -Infinity;
		}
		return value;
	};

	return [...items].sort((a, b) => {
		const valA = getSortValue(a);
		const valB = getSortValue(b);

		if (valA === valB) return 0;
		return direction === 'asc' ? valA - valB : valB - valA;
	});
}

/**
 * Formats a raw metric number into a human-readable UI badge or section header string.
 * Evaluates entry state and target mode ('badge' or 'section') to return the formatted label.
 */
export function formatMetricValue(
	value: number | null,
	metricId: string,
	state: AppState = 'CACHED',
	mode: 'badge' | 'section' = 'badge',
): string {
	if (mode === 'section') {
		if (
			state !== 'CACHED' ||
			value === null ||
			value === undefined ||
			value === Infinity ||
			value === -Infinity
		) {
			return 'No Data';
		}
	} else {
		if (state === 'ERROR_CACHE') return 'No data';
		if (state === 'MISSING' || state === 'BATCHING' || state === 'QUEUED' || state === 'FETCHING') return 'Loading...';
		if (value === null || value === undefined || value === Infinity || value === -Infinity) return 'No data';
	}

	let metricType: string = 'time';
	const streams = getAvailableStreams();
	for (const stream of streams) {
		const found = stream.metrics.find((m) => m.id === metricId);
		if (found) {
			metricType = found.type;
			break;
		}
	}

	if (mode === 'section') {
		switch (metricType) {
			case 'rating':
				return value >= 90
					? 'Over 90%'
					: value >= 80
						? 'Over 80%'
						: value >= 70
							? 'Over 70%'
							: value >= 50
								? 'Over 50%'
								: 'Under 50%';
			case 'score':
				return value >= 10000
					? 'Over 10,000 Points'
					: value >= 5000
						? 'Over 5,000 Points'
						: value >= 1000
							? 'Over 1,000 Points'
							: value >= 500
								? 'Over 500 Points'
								: value >= 100
									? 'Over 100 Points'
									: value > 0
										? 'Less Than 100 Points'
										: 'No Points';
			case 'count':
				return value >= 100
					? 'Over 100 Achievements'
					: value >= 50
						? 'Over 50 Achievements'
						: value >= 20
							? 'Over 20 Achievements'
							: value > 0
								? 'Less Than 20 Achievements'
								: 'No Achievements';
			case 'time':
			default:
				return value >= 6000
					? 'Over 100 Hours'
					: value >= 3600
						? 'Over 60 Hours'
						: value >= 2400
							? 'Over 40 Hours'
							: value >= 1200
								? 'Over 20 Hours'
								: value >= 600
									? 'Over 10 Hours'
									: value >= 60
										? 'Over 1 Hour'
										: 'Less Than 1 Hour';
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
 * Formats a duration in seconds into a human-readable string (e.g. "17m 10s" or "45s").
 */
export function formatDurationSeconds(totalSeconds: number): string {
	if (totalSeconds <= 0) return '0s';
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes > 0) {
		return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
	}
	return `${seconds}s`;
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
		const countdown = progress.retryAfterSeconds && progress.retryAfterSeconds > 0
			? ` - retry in ${formatDurationSeconds(progress.retryAfterSeconds)}`
			: '';
		return {
			text: `⚠ Rate limited (${tag})${countdown} - ${progress.totalPending} left in queue`,
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
