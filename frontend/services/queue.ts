import { callable } from '@steambrew/client';
import { getSettings } from './settings';
import { logger } from './logger';

const getCacheBatch = callable<[{ args_json: string }], string>('GetCacheBatch');
const appendToCache = callable<[{ args_json: string }], string>('AppendToCache');
const fetchStreamData = callable<[{ args_json: string }], string>('FetchStreamData');

declare global {
	var appStore: any;
}

export interface CacheEntry {
	data: any;
	fetchedAt: number;
	error?: boolean;
}

type StreamState = 'HEALTHY' | 'RATE_LIMITED';

class QueueService {
	private cache: Record<string, Record<string, CacheEntry>> = {};

	private highPriority: Record<string, string[]> = {};
	private lowPriority: Record<string, string[]> = {};

	private streamStates: Record<string, StreamState> = {};
	private suspendedPool: Record<string, number[]> = {};
	private failCounts: Record<string, Record<string, number>> = {};

	private processingStreams: Set<string> = new Set();
	private recoveringStreams: Set<string> = new Set();
	private listeners: Set<() => void> = new Set();

	private isDismounted = false;

	public subscribe(fn: () => void): () => void {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	}

	private notify() {
		this.listeners.forEach((fn) => fn());
	}

	public getCachedData(streamId: string, appId: number): any {
		return this.cache[streamId]?.[appId.toString()]?.data || null;
	}

	public getStreamState(streamId: string): StreamState {
		return this.streamStates[streamId] || 'HEALTHY';
	}

	public dismount() {
		this.isDismounted = true;
	}

	public async enqueue(appIds: number[], metric: string) {
		const streamId = metric.split('_')[0] || 'hltb';
		const stringIds = appIds.map(String);

		if (!this.cache[streamId]) {
			this.cache[streamId] = {};
		}
		if (!this.highPriority[streamId]) {
			this.highPriority[streamId] = [];
		}
		if (!this.lowPriority[streamId]) {
			this.lowPriority[streamId] = [];
		}

		const missingFromMem = stringIds.filter((id) => !this.cache[streamId]![id]);
		if (missingFromMem.length > 0) {
			try {
				const payload = { stream_id: streamId, app_ids: missingFromMem };
				const raw = await getCacheBatch({ args_json: JSON.stringify(payload) });
				const res = JSON.parse(raw);

				if (res.success && res.data) {
					for (const [id, entry] of Object.entries(res.data)) {
						let fetchedAt = (entry as any).fetchedAt;
						if (!fetchedAt && (entry as any).expiry) {
							fetchedAt = (entry as any).expiry - 7 * 24 * 60 * 60;
						}
						this.cache[streamId]![id] = {
							data: (entry as any).data,
							fetchedAt: fetchedAt || 0,
							error: (entry as any).error,
						};
					}
				}
			} catch (e) {
				logger.error('QueueService: Failed to read backend cache', e);
			}
		}

		const settings = getSettings();
		const now = Math.floor(Date.now() / 1000);
		const softLimit = (settings.softCacheDays || 4) * 24 * 60 * 60;
		const defaultHardLimit = (settings.hardCacheDays || 7) * 24 * 60 * 60;

		let addedHigh = 0;
		let addedLow = 0;

		for (const id of stringIds) {
			const entry = this.cache[streamId]?.[id];
			const age = entry ? now - entry.fetchedAt : Infinity;
			const target = id;

			const hardLimit = entry?.error ? 24 * 60 * 60 : defaultHardLimit;

			if ((entry?.error && age > hardLimit) || !entry || age > hardLimit) {
				if (!this.highPriority[streamId]!.includes(target)) {
					this.highPriority[streamId] = this.highPriority[streamId]!.filter((item) => item !== target);
					this.highPriority[streamId]!.push(target);
					addedHigh++;
				}
			} else if (age > softLimit) {
				if (!this.lowPriority[streamId]!.includes(target) && !this.highPriority[streamId]!.includes(target)) {
					this.lowPriority[streamId]!.push(target);
					addedLow++;
				}
			}
		}

		if (addedHigh > 0 || addedLow > 0) {
			logger.info(`QueueService [${streamId}]: Enqueued ${addedHigh} high priority, ${addedLow} low priority items.`);
		}

		this.notify();
		this.startProcessing(streamId);
	}

	private async startProcessing(streamId: string) {
		if (this.processingStreams.has(streamId)) return;
		this.processingStreams.add(streamId);

		logger.info(`QueueService [${streamId}]: Starting background queue processing.`);

		while ((this.highPriority[streamId] && this.highPriority[streamId].length > 0) || (this.lowPriority[streamId] && this.lowPriority[streamId].length > 0)) {
			if (this.isDismounted) break;

			let appId: string | undefined;

			if (this.highPriority[streamId] && this.highPriority[streamId].length > 0) {
				appId = this.highPriority[streamId].pop();
			} else if (this.lowPriority[streamId] && this.lowPriority[streamId].length > 0) {
				appId = this.lowPriority[streamId].shift();
			}

			if (!appId) continue;

			if (this.streamStates[streamId] === 'RATE_LIMITED') {
				if (!this.suspendedPool[streamId]) this.suspendedPool[streamId] = [];
				const numAppId = Number(appId);
				if (!this.suspendedPool[streamId].includes(numAppId)) {
					this.suspendedPool[streamId].push(numAppId);
				}
				continue;
			}

			try {
				const payload = { stream_id: streamId, app_id: appId };
				const raw = await fetchStreamData({ args_json: JSON.stringify(payload) });
				const res = JSON.parse(raw);

				if (res.success && res.result && !res.result.error) {
					const now = Math.floor(Date.now() / 1000);
					const newEntry = { data: res.result.data, fetchedAt: now, error: false };

					if (!this.cache[streamId]) this.cache[streamId] = {};
					this.cache[streamId]![appId] = newEntry;

					if (!this.failCounts[streamId]) this.failCounts[streamId] = {};
					delete this.failCounts[streamId][appId];

					try {
						const savePayload = { stream_id: streamId, new_data: { [appId]: newEntry } };
						await appendToCache({ args_json: JSON.stringify(savePayload) });
					} catch (e) {
						logger.error(`QueueService [${streamId}]: Failed to append to Lua cache`, e);
					}

					logger.info(
						`QueueService [${streamId}]: Fetched ${appId}. Remaining tasks: ${(this.highPriority[streamId]?.length || 0) + (this.lowPriority[streamId]?.length || 0)}`,
					);
					this.notify();
				} else {
					const errorReason = String(res.error || (res.result && res.result.details) || 'Unknown backend error');
					const isRateLimit =
						errorReason.includes('429') ||
						errorReason.includes('500') ||
						errorReason.toLowerCase().includes('timeout') ||
						errorReason.toLowerCase().includes('internal server error');

					logger.warn(`QueueService [${streamId}]: Fetch error on AppID ${appId}. Reason: ${errorReason}.`);

					if (isRateLimit) {
						this.handleRateLimit(streamId, Number(appId));
					} else {
						this.handleTransientError(streamId, appId);
					}
				}
			} catch (error) {
				logger.error(`QueueService [${streamId}]: IPC or network failure fetching AppID ${appId}.`, error);

				const errorString = String(error).toLowerCase();
				const isRateLimit =
					errorString.includes('429') || errorString.includes('500') || errorString.includes('timeout') || errorString.includes('internal server error');

				if (isRateLimit) {
					this.handleRateLimit(streamId, Number(appId));
				} else {
					this.handleTransientError(streamId, appId);
				}
			}

			await new Promise((r) => setTimeout(r, 500));
		}

		logger.info(`QueueService [${streamId}]: Processing complete or interrupted. Queue halted.`);
		this.processingStreams.delete(streamId);
	}

	private handleTransientError(streamId: string, appId: string) {
		if (!this.failCounts[streamId]) {
			this.failCounts[streamId] = {};
		}
		this.failCounts[streamId][appId] = (this.failCounts[streamId][appId] || 0) + 1;
		const fails = this.failCounts[streamId][appId];

		if (fails >= 3) {
			logger.warn(`QueueService [${streamId}]: AppID ${appId} reached 3 failures. Applying negative cache.`);
			const now = Math.floor(Date.now() / 1000);
			const negativeEntry: CacheEntry = { data: null, fetchedAt: now, error: true };

			if (!this.cache[streamId]) this.cache[streamId] = {};
			this.cache[streamId][appId] = negativeEntry;

			try {
				const savePayload = { stream_id: streamId, new_data: { [appId]: negativeEntry } };
				appendToCache({ args_json: JSON.stringify(savePayload) });
			} catch (e) {
				logger.error(`QueueService [${streamId}]: Failed to save negative cache to Lua`, e);
			}

			delete this.failCounts[streamId][appId];
			this.notify();
		} else {
			if (!this.lowPriority[streamId]) this.lowPriority[streamId] = [];
			this.lowPriority[streamId].push(appId);
		}
	}

	private handleRateLimit(streamId: string, appId: number) {
		this.streamStates[streamId] = 'RATE_LIMITED';
		if (!this.suspendedPool[streamId]) this.suspendedPool[streamId] = [];
		if (!this.suspendedPool[streamId].includes(appId)) {
			this.suspendedPool[streamId].push(appId);
		}
		this.notify();
		this.startRecoveryLoop(streamId);
	}

	private async startRecoveryLoop(streamId: string) {
		if (this.recoveringStreams.has(streamId)) return;
		this.recoveringStreams.add(streamId);

		logger.info(`QueueService [${streamId}]: Starting background recovery subsystem.`);

		while (this.streamStates[streamId] === 'RATE_LIMITED') {
			if (this.isDismounted) break;

			await new Promise((r) => setTimeout(r, 60000));

			if (this.isDismounted) break;

			const pool = this.suspendedPool[streamId] || [];
			if (pool.length === 0) {
				this.streamStates[streamId] = 'HEALTHY';
				this.notify();
				break;
			}

			const testAppId = pool[0];
			if (testAppId === undefined) continue;

			logger.info(`QueueService [${streamId}]: Testing recovery with AppID ${testAppId}.`);

			try {
				const payload = { stream_id: streamId, app_id: testAppId.toString() };
				const raw = await fetchStreamData({ args_json: JSON.stringify(payload) });
				const res = JSON.parse(raw);

				if (res.success && res.result && !res.result.error) {
					logger.info(`QueueService [${streamId}]: Stream recovered. Restoring suspended items.`);
					this.streamStates[streamId] = 'HEALTHY';

					const now = Math.floor(Date.now() / 1000);
					const newEntry = { data: res.result.data, fetchedAt: now, error: false };

					if (!this.cache[streamId]) this.cache[streamId] = {};
					this.cache[streamId][testAppId.toString()] = newEntry;

					try {
						const savePayload = { stream_id: streamId, new_data: { [testAppId]: newEntry } };
						await appendToCache({ args_json: JSON.stringify(savePayload) });
					} catch (e) {
						logger.error(`QueueService [${streamId}]: Failed to append recovery data to Lua cache`, e);
					}

					pool.shift();
					if (!this.highPriority[streamId]) this.highPriority[streamId] = [];
					for (const id of pool) {
						this.highPriority[streamId].push(id.toString());
					}

					this.suspendedPool[streamId] = [];
					this.notify();
					this.startProcessing(streamId);
					break;
				} else {
					logger.warn(`QueueService [${streamId}]: Stream is still rate limited.`);
				}
			} catch (error) {
				logger.warn(`QueueService [${streamId}]: Stream test failed during recovery.`);
			}
		}

		logger.info(`QueueService [${streamId}]: Recovery complete or interrupted.`);
		this.recoveringStreams.delete(streamId);
	}

	public forceSyncLibrary(metric: string) {
		try {
			if (typeof appStore !== 'undefined' && appStore.m_mapApps) {
				const allAppIds = Array.from(appStore.m_mapApps.keys())
					.map(Number)
					.filter((id) => !isNaN(id));

				logger.info(`Force Sync requested. Evaluating ${allAppIds.length} games for metric: ${metric}`);

				this.enqueue(allAppIds, metric);
			} else {
				logger.warn('appStore is not available. Cannot force sync library.');
			}
		} catch (error) {
			logger.error('Failed to trigger force sync:', error);
		}
	}
}

export const queueService = new QueueService();
