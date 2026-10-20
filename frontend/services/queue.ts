import { callable } from '@steambrew/client';
import { getSettings, getAvailableStreams } from './settings';
import { logger } from './logger';

const getCacheBatch = callable<[{ args_json: string }], string>('GetCacheBatch');
const appendToCache = callable<[{ args_json: string }], string>('AppendToCache');
const fetchStreamData = callable<[{ args_json: string }], string>('FetchStreamData');
const getAvailableStreamsRpc = callable<[], string>('GetAvailableStreams');

declare global {
	var appStore: any;
}

/**
 * Represents the current lifecycle state of a game's metric data within the memory cache.
 */
export type AppState = 'MISSING' | 'BATCHING' | 'QUEUED' | 'FETCHING' | 'CACHED' | 'ERROR_CACHE';

/**
 * An individual memory cache record for a specific game and data stream.
 * Tracks the data payload, staleness, and failure counts.
 */
export interface CacheEntry {
	state: AppState;
	data: any;
	fetchedAt: number;
	failCount: number;
}

/**
 * Summary of a full library sync operation across one or more data streams.
 */
export interface LibrarySyncReport {
	totalGames: number;
	totalQueued: number;
	totalPending: number;
	streamResults: Record<string, { queued: number; pending: number }>;
}

/**
 * Real-time progress snapshot of active queue processing across streams.
 */
export interface SyncProgressReport {
	isRunning: boolean;
	isRateLimited: boolean;
	retryAfterSeconds?: number;
	totalPending: number;
	totalInitial: number;
	streamProgress: Record<string, { pending: number; initial: number; isRateLimited: boolean; retryAfterSeconds?: number }>;
}

class QueueService {
	private cache: Record<string, Record<string, CacheEntry>> = {};

	private highPriority: Record<string, string[]> = {};
	private lowPriority: Record<string, string[]> = {};

	private isRateLimited: Record<string, boolean> = {};
	private rateLimitUntil: Record<string, number> = {};
	private processingStreams: Set<string> = new Set();
	private recoveringStreams: Set<string> = new Set();

	private pendingSaves: Record<string, Record<string, any>> = {};
	private saveTimers: Record<string, any> = {};

	private streamDelays: Record<string, number> | null = null;
	private listeners: Set<() => void> = new Set();
	private isDismounted = false;

	private async getDelay(streamId: string): Promise<number> {
		const streams = getAvailableStreams();
		const stream = streams.find((s) => s.id === streamId);
		if (stream?.delay) return stream.delay;

		if (!this.streamDelays) {
			this.streamDelays = {};
			try {
				const raw = await getAvailableStreamsRpc();
				const res = JSON.parse(raw);
				if (res.success && res.data) {
					res.data.forEach((s: any) => { this.streamDelays![s.id] = s.delay; });
				}
			} catch (e) {
				logger.error('QueueService: Failed to fetch stream delays from IPC', e);
			}
		}
		return this.streamDelays[streamId] || 2000;
	}

	public subscribe(fn: () => void): () => void {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	}

	private notify() {
		this.listeners.forEach((fn) => fn());
	}

	public dismount() {
		this.isDismounted = true;
	}

	/**
	 * Returns the rate limit status for a given stream ('RATE_LIMITED' or 'HEALTHY').
	 */
	public getStreamState(streamId: string): string {
		return this.isRateLimited[streamId] ? 'RATE_LIMITED' : 'HEALTHY';
	}

	/**
	 * Returns the remaining rate limit cooldown in seconds for a stream, or 0 if healthy.
	 */
	public getRateLimitRemaining(streamId: string): number {
		const until = this.rateLimitUntil[streamId];
		if (!until) return 0;
		const now = Math.floor(Date.now() / 1000);
		return Math.max(0, until - now);
	}

	/**
	 * Returns the cache lifecycle state for a specific game within a stream.
	 */
	public getEntryState(streamId: string, appId: number): string {
		return this.cache[streamId]?.[appId.toString()]?.state || 'MISSING';
	}

	private getEntry(streamId: string, appId: string): CacheEntry {
		if (!this.cache[streamId]) this.cache[streamId] = {};
		if (!this.cache[streamId][appId]) {
			this.cache[streamId][appId] = { state: 'MISSING', data: null, fetchedAt: 0, failCount: 0 };
		}
		return this.cache[streamId][appId];
	}

	/**
	 * Returns cached data for a game if its state is CACHED, or null otherwise.
	 */
	public getCachedData(streamId: string, appId: number): any {
		const entry = this.cache[streamId]?.[appId.toString()];
		return entry?.state === 'CACHED' ? entry.data : null;
	}

	/**
	 * Checks whether a game has a resolved cache entry (either valid data or error cache).
	 */
	public hasCacheEntry(streamId: string, appId: number): boolean {
		const state = this.cache[streamId]?.[appId.toString()]?.state;
		return state === 'CACHED' || state === 'ERROR_CACHE';
	}

	private batchSave(streamId: string, appId: string, payload: any) {
		if (!this.pendingSaves[streamId]) this.pendingSaves[streamId] = {};
		this.pendingSaves[streamId][appId] = payload;

		if (Object.keys(this.pendingSaves[streamId]).length >= 100) {
			this.flushSaves(streamId);
		} else if (!this.saveTimers[streamId]) {
			this.saveTimers[streamId] = setTimeout(() => this.flushSaves(streamId), 1000);
		}
	}

	private async flushSaves(streamId: string) {
		if (this.saveTimers[streamId]) {
			clearTimeout(this.saveTimers[streamId]);
			this.saveTimers[streamId] = null;
		}
		const dataToSave = this.pendingSaves[streamId];
		if (!dataToSave || Object.keys(dataToSave).length === 0) return;

		this.pendingSaves[streamId] = {};

		try {
			const payload = { stream_id: streamId, new_data: dataToSave };
			await appendToCache({ args_json: JSON.stringify(payload) });
		} catch (e) {
			logger.error(`QueueService [${streamId}]: Failed to flush saves to Lua`, e);
		}
	}

	/**
	 * Enqueues an array of AppIDs for batch loading and background fetching for a stream.
	 * Returns the count of newly queued games and total games evaluated.
	 */
	public async enqueue(appIds: number[], streamOrMetric: string): Promise<{ queued: number; total: number }> {
		const streamId = (streamOrMetric.includes('_') ? streamOrMetric.split('_')[0] : streamOrMetric) || 'hltb';
		const stringIds = appIds.map(String);

		if (!this.highPriority[streamId]) this.highPriority[streamId] = [];
		if (!this.lowPriority[streamId]) this.lowPriority[streamId] = [];

		let queuedCount = 0;
		const toBatchLoad: string[] = [];
		const settings = getSettings();
		const now = Math.floor(Date.now() / 1000);
		const softLimit = (settings.softCacheDays || 4) * 24 * 60 * 60;
		const hardLimit = (settings.hardCacheDays || 7) * 24 * 60 * 60;

		for (const id of stringIds) {
			const entry = this.getEntry(streamId, id);
			
			// State Lock: Drop duplicate requests
			if (entry.state === 'QUEUED' || entry.state === 'FETCHING' || entry.state === 'BATCHING') {
				continue;
			}

			const age = entry.fetchedAt ? now - entry.fetchedAt : Infinity;

			if (entry.fetchedAt === 0 && entry.state !== 'ERROR_CACHE') {
				entry.state = 'BATCHING';
				toBatchLoad.push(id);
			} else {
				if (entry.state === 'ERROR_CACHE') {
					if (age > 24 * 60 * 60) {
						this.pushToQueue(streamId, id, true);
						queuedCount++;
					}
				} else if (age > hardLimit) {
					this.pushToQueue(streamId, id, true);
					queuedCount++;
				} else if (age > softLimit) {
					this.pushToQueue(streamId, id, false);
					queuedCount++;
				}
			}
		}

		// Paginated IPC Load
		for (let i = 0; i < toBatchLoad.length; i += 100) {
			const batch = toBatchLoad.slice(i, i + 100);
			try {
				const payload = { stream_id: streamId, app_ids: batch };
				const raw = await getCacheBatch({ args_json: JSON.stringify(payload) });
				const res = JSON.parse(raw);

				if (res.success && res.data) {
					for (const id of batch) {
						const diskEntry = res.data[id];
						const memEntry = this.getEntry(streamId, id);

						if (diskEntry) {
							memEntry.data = diskEntry.data;
							memEntry.fetchedAt = diskEntry.fetchedAt || 0;
							memEntry.state = diskEntry.error ? 'ERROR_CACHE' : 'CACHED';
							memEntry.failCount = 0;

							const age = now - memEntry.fetchedAt;
							const limit = memEntry.state === 'ERROR_CACHE' ? 24 * 60 * 60 : hardLimit;

							if (age > limit) {
								this.pushToQueue(streamId, id, true);
								queuedCount++;
							} else if (memEntry.state === 'CACHED' && age > softLimit) {
								this.pushToQueue(streamId, id, false);
								queuedCount++;
							}
						} else {
							this.pushToQueue(streamId, id, true);
							queuedCount++;
						}
					}
				}
			} catch (e) {
				logger.error(`QueueService [${streamId}]: GetCacheBatch failed`, e);
				for (const id of batch) {
					this.pushToQueue(streamId, id, true);
					queuedCount++;
				}
			}
		}

		this.notify();
		if (!this.isRateLimited[streamId]) {
			this.startProcessing(streamId);
		}

		return { queued: queuedCount, total: stringIds.length };
	}

	private pushToQueue(streamId: string, appId: string, isHigh: boolean) {
		const entry = this.getEntry(streamId, appId);
		entry.state = 'QUEUED';

		if (!this.highPriority[streamId]) this.highPriority[streamId] = [];
		if (!this.lowPriority[streamId]) this.lowPriority[streamId] = [];

		if (isHigh) {
			this.highPriority[streamId] = this.highPriority[streamId]!.filter((id) => id !== appId);
			this.highPriority[streamId]!.push(appId);
		} else {
			this.lowPriority[streamId] = this.lowPriority[streamId]!.filter((id) => id !== appId);
			this.lowPriority[streamId]!.push(appId);
		}
	}

	private async startProcessing(streamId: string) {
		if (this.processingStreams.has(streamId) || this.isRateLimited[streamId]) return;
		this.processingStreams.add(streamId);

		if (!this.highPriority[streamId]) this.highPriority[streamId] = [];
		if (!this.lowPriority[streamId]) this.lowPriority[streamId] = [];

		while (this.highPriority[streamId]!.length > 0 || this.lowPriority[streamId]!.length > 0) {
			if (this.isDismounted) break;

			let appId: string | undefined;
			if (this.highPriority[streamId]!.length > 0) {
				appId = this.highPriority[streamId]!.pop();
			} else if (this.lowPriority[streamId]!.length > 0) {
				appId = this.lowPriority[streamId]!.shift();
			}

			if (!appId) continue;

			const entry = this.getEntry(streamId, appId);
			entry.state = 'FETCHING';

			try {
				const payload = { stream_id: streamId, app_id: appId };
				const raw = await fetchStreamData({ args_json: JSON.stringify(payload) });
				const res = JSON.parse(raw);

				if (this.isDismounted) break;

				if (res.success && res.result && !res.result.error) {
					entry.state = 'CACHED';
					entry.data = res.result.data;
					entry.fetchedAt = Math.floor(Date.now() / 1000);
					entry.failCount = 0;

					this.batchSave(streamId, appId, { data: entry.data, fetchedAt: entry.fetchedAt, error: false });
				} else {
					const status = Number(res?.result?.status) || 0;

					if (status === 429 || status === 503) {
						entry.state = 'QUEUED';
						this.highPriority[streamId]!.push(appId);
						this.isRateLimited[streamId] = true;
						const serverRetry = Number(res?.result?.retry_after);
						const retrySeconds = (serverRetry && serverRetry > 0) ? serverRetry : 300;
						this.rateLimitUntil[streamId] = Math.floor(Date.now() / 1000) + retrySeconds;
						logger.warn(`QueueService [${streamId}]: Rate limited. Server requested ${retrySeconds}s backoff.`);
						this.notify();
						this.startRecoveryLoop(streamId, retrySeconds);
						break;
					} else {
						entry.failCount += 1;
						if (entry.failCount >= 3) {
							entry.state = 'ERROR_CACHE';
							entry.data = null;
							entry.fetchedAt = Math.floor(Date.now() / 1000);
							this.batchSave(streamId, appId, { data: null, fetchedAt: entry.fetchedAt, error: true });
						} else {
							entry.state = 'QUEUED';
							this.lowPriority[streamId]!.push(appId);
						}
					}
				}
			} catch (error) {
				if (this.isDismounted) break;
				entry.failCount += 1;
				if (entry.failCount >= 3) {
					entry.state = 'ERROR_CACHE';
					entry.data = null;
					entry.fetchedAt = Math.floor(Date.now() / 1000);
					this.batchSave(streamId, appId, { data: null, fetchedAt: entry.fetchedAt, error: true });
				} else {
					entry.state = 'QUEUED';
					this.lowPriority[streamId]!.push(appId);
				}
			}

			this.notify();

			const delayMs = await this.getDelay(streamId);
			await new Promise((r) => setTimeout(r, delayMs));
			if (this.isDismounted) break;
		}

		this.processingStreams.delete(streamId);
	}

	private async startRecoveryLoop(streamId: string, initialRetrySeconds?: number) {
		if (this.recoveringStreams.has(streamId)) return;
		this.recoveringStreams.add(streamId);

		let sleepTime = initialRetrySeconds || 300;
		if (!this.highPriority[streamId]) this.highPriority[streamId] = [];
		if (!this.lowPriority[streamId]) this.lowPriority[streamId] = [];

		while (this.isRateLimited[streamId]) {
			if (this.isDismounted) break;

			const now = Math.floor(Date.now() / 1000);
			const target = this.rateLimitUntil[streamId] || (now + sleepTime);
			const remainingWait = Math.max(1, target - now);

			await new Promise((r) => setTimeout(r, remainingWait * 1000));
			if (this.isDismounted) break;

			if (this.highPriority[streamId]!.length === 0 && this.lowPriority[streamId]!.length === 0) {
				this.isRateLimited[streamId] = false;
				delete this.rateLimitUntil[streamId];
				this.notify();
				break;
			}

			const appId = this.highPriority[streamId]!.pop();
			if (!appId) continue;

			const entry = this.getEntry(streamId, appId);
			entry.state = 'FETCHING';

			try {
				const payload = { stream_id: streamId, app_id: appId };
				const raw = await fetchStreamData({ args_json: JSON.stringify(payload) });
				const res = JSON.parse(raw);

				if (this.isDismounted) break;

				if (res.success && res.result && !res.result.error) {
					entry.state = 'CACHED';
					entry.data = res.result.data;
					entry.fetchedAt = Math.floor(Date.now() / 1000);
					entry.failCount = 0;
					this.batchSave(streamId, appId, { data: entry.data, fetchedAt: entry.fetchedAt, error: false });

					this.isRateLimited[streamId] = false;
					delete this.rateLimitUntil[streamId];
					this.notify();
					this.startProcessing(streamId);
					break;
				} else {
					const status = Number(res?.result?.status) || 0;
					if (status === 429 || status === 503) {
						entry.state = 'QUEUED';
						this.highPriority[streamId]!.push(appId);
						const serverRetry = Number(res?.result?.retry_after);
						sleepTime = (serverRetry && serverRetry > 0) ? serverRetry : Math.min(sleepTime * 2, 1800);
						this.rateLimitUntil[streamId] = Math.floor(Date.now() / 1000) + sleepTime;
						logger.warn(`QueueService [${streamId}]: Still rate limited during recovery. Sleeping ${sleepTime}s.`);
						this.notify();
					} else {
						entry.failCount += 1;
						if (entry.failCount >= 3) {
							entry.state = 'ERROR_CACHE';
							entry.data = null;
							entry.fetchedAt = Math.floor(Date.now() / 1000);
							this.batchSave(streamId, appId, { data: null, fetchedAt: entry.fetchedAt, error: true });
						} else {
							entry.state = 'QUEUED';
							this.lowPriority[streamId]!.push(appId);
						}
						this.isRateLimited[streamId] = false;
						delete this.rateLimitUntil[streamId];
						this.notify();
						this.startProcessing(streamId);
						break;
					}
				}
			} catch (e) {
				if (this.isDismounted) break;
				entry.state = 'QUEUED';
				this.highPriority[streamId]!.push(appId);
				sleepTime = Math.min(sleepTime * 2, 1800);
				this.rateLimitUntil[streamId] = Math.floor(Date.now() / 1000) + sleepTime;
				this.notify();
			}
		}

		this.recoveringStreams.delete(streamId);
	}

	/**
	 * Returns the total count of items pending in high and low priority queues for a stream.
	 */
	public getPendingCount(streamId: string): number {
		const high = this.highPriority[streamId]?.length || 0;
		const low = this.lowPriority[streamId]?.length || 0;
		return high + low;
	}

	private syncTotals: Record<string, number> = {};

	/**
	 * Compiles real-time sync progress across requested streams, comparing pending against initial counts.
	 */
	public getSyncProgress(streamIds: string[]): SyncProgressReport {
		let totalPending = 0;
		let totalInitial = 0;
		let isRunning = false;
		let isRateLimited = false;
		let maxRetryRemaining = 0;
		const streamProgress: Record<string, { pending: number; initial: number; isRateLimited: boolean; retryAfterSeconds?: number }> = {};

		for (const streamId of streamIds) {
			const pending = this.getPendingCount(streamId);
			const initial = Math.max(this.syncTotals[streamId] || 0, pending);
			const streamRunning = this.processingStreams.has(streamId) || this.recoveringStreams.has(streamId);
			const streamLimited = !!this.isRateLimited[streamId];
			const remaining = this.getRateLimitRemaining(streamId);

			if (pending > 0 || streamRunning) {
				isRunning = true;
			}
			if (streamLimited) {
				isRateLimited = true;
				if (remaining > maxRetryRemaining) {
					maxRetryRemaining = remaining;
				}
			}

			if (pending === 0 && !streamRunning) {
				this.syncTotals[streamId] = 0;
			}

			totalPending += pending;
			totalInitial += initial;
			streamProgress[streamId] = {
				pending,
				initial,
				isRateLimited: streamLimited,
				retryAfterSeconds: streamLimited && remaining > 0 ? remaining : undefined,
			};
		}

		return {
			isRunning,
			isRateLimited,
			retryAfterSeconds: isRateLimited && maxRetryRemaining > 0 ? maxRetryRemaining : undefined,
			totalPending,
			totalInitial,
			streamProgress,
		};
	}

	/**
	 * Evaluates and enqueues all library games across specified streams, returning an aggregate sync report.
	 */
	public async syncLibrary(streamIds: string[]): Promise<LibrarySyncReport> {
		if (typeof appStore === 'undefined' || !appStore.m_mapApps) {
			logger.warn('QueueService: appStore is not available for library sync.');
			return { totalGames: 0, totalQueued: 0, totalPending: 0, streamResults: {} };
		}

		const allAppIds = Array.from(appStore.m_mapApps.keys())
			.map(Number)
			.filter((id) => !isNaN(id));

		const report: LibrarySyncReport = {
			totalGames: allAppIds.length,
			totalQueued: 0,
			totalPending: 0,
			streamResults: {},
		};

		logger.info(`QueueService: Library sync requested for streams [${streamIds.join(', ')}] across ${allAppIds.length} games.`);

		for (const streamId of streamIds) {
			const { queued } = await this.enqueue(allAppIds, streamId);
			const pending = this.getPendingCount(streamId);
			this.syncTotals[streamId] = pending;
			report.streamResults[streamId] = { queued, pending };
			report.totalQueued += queued;
			report.totalPending += pending;
		}

		return report;
	}

	/**
	 * Triggers a full library sync for a single stream or metric.
	 */
	public async forceSyncLibrary(streamOrMetric: string): Promise<{ queued: number; total: number }> {
		const streamId = (streamOrMetric.includes('_') ? streamOrMetric.split('_')[0] : streamOrMetric) || 'hltb';
		const report = await this.syncLibrary([streamId]);
		return { queued: report.totalQueued, total: report.totalGames };
	}
}

/**
 * The global singleton instance of the QueueService.
 * Consumed by UI components to queue IPC data fetches and read cached metrics.
 */
export const queueService = new QueueService();
