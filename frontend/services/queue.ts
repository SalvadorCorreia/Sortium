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
}

type StreamState = 'HEALTHY' | 'RATE_LIMITED';

class QueueService {
	private cache: Record<string, Record<string, CacheEntry>> = {};

	private highPriority: string[] = [];
	private lowPriority: string[] = [];

	private streamStates: Record<string, StreamState> = {};
	private suspendedPool: Record<string, number[]> = {};

	private processing = false;
	private recovering = false;
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

	public dismount() {
		this.isDismounted = true;
	}

	public async enqueue(appIds: number[], metric: string) {
		const streamId = metric.split('_')[0] || 'hltb';
		const stringIds = appIds.map(String);

		if (!this.cache[streamId]) {
			this.cache[streamId] = {};
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
						this.cache[streamId]![id] = { data: (entry as any).data, fetchedAt: fetchedAt || 0 };
					}
				}
			} catch (e) {
				logger.error('QueueService: Failed to read backend cache', e);
			}
		}

		const settings = getSettings();
		const now = Math.floor(Date.now() / 1000);
		const softLimit = (settings.softCacheDays || 4) * 24 * 60 * 60;
		const hardLimit = (settings.hardCacheDays || 7) * 24 * 60 * 60;

		let addedHigh = 0;
		let addedLow = 0;

		for (const id of stringIds) {
			const entry = this.cache[streamId]?.[id];
			const age = entry ? now - entry.fetchedAt : Infinity;
			const target = `${streamId}:${id}`;

			if (!entry || age > hardLimit) {
				this.highPriority = this.highPriority.filter((item) => item !== target);
				this.highPriority.push(target);
				addedHigh++;
			} else if (age > softLimit) {
				if (!this.lowPriority.includes(target)) {
					this.lowPriority.push(target);
					addedLow++;
				}
			}
		}

		if (addedHigh > 0 || addedLow > 0) {
			logger.info(`QueueService: Enqueued ${addedHigh} high priority, ${addedLow} low priority items.`);
		}

		this.notify();
		this.startProcessing();
	}

	private async startProcessing() {
		if (this.processing) return;
		this.processing = true;

		logger.info('QueueService: Starting background queue processing.');

		while (this.highPriority.length > 0 || this.lowPriority.length > 0) {
			if (this.isDismounted) break;

			let target: string | undefined;
			let isHigh = false;

			if (this.highPriority.length > 0) {
				target = this.highPriority.pop();
				isHigh = true;
			} else {
				target = this.lowPriority.shift();
			}

			if (!target) continue;

			const parts = target.split(':');
			const streamId = parts[0];
			const appId = parts[1];

			if (!streamId || !appId) continue;

			if (this.streamStates[streamId] === 'RATE_LIMITED') {
				if (!this.suspendedPool[streamId]) this.suspendedPool[streamId] = [];
				if (!this.suspendedPool[streamId].includes(Number(appId))) {
					this.suspendedPool[streamId].push(Number(appId));
				}
				continue;
			}

			try {
				const payload = { stream_id: streamId, app_id: appId };
				const raw = await fetchStreamData({ args_json: JSON.stringify(payload) });
				const res = JSON.parse(raw);

				if (res.success && res.result && !res.result.error) {
					const now = Math.floor(Date.now() / 1000);
					const newEntry = { data: res.result.data, fetchedAt: now };

					if (!this.cache[streamId]) this.cache[streamId] = {};
					this.cache[streamId]![appId] = newEntry;

					try {
						const savePayload = { stream_id: streamId, new_data: { [appId]: newEntry } };
						await appendToCache({ args_json: JSON.stringify(savePayload) });
					} catch (e) {
						logger.error('QueueService: Failed to append to Lua cache', e);
					}

					logger.info(`QueueService: Fetched ${appId} for ${streamId}. Remaining tasks: ${this.highPriority.length + this.lowPriority.length}`);
					this.notify();
				} else {
					const errorReason = String(res.error || (res.result && res.result.details) || 'Unknown backend error');
					const isRateLimit =
						errorReason.includes('429') ||
						errorReason.includes('500') ||
						errorReason.toLowerCase().includes('timeout') ||
						errorReason.toLowerCase().includes('internal server error');

					logger.warn(`QueueService: Fetch error on AppID ${appId} for ${streamId}. Reason: ${errorReason}.`);

					if (isRateLimit) {
						this.handleRateLimit(streamId, Number(appId));
					} else {
						if (isHigh) this.highPriority.push(target);
						else this.lowPriority.push(target);
						await new Promise((r) => setTimeout(r, 1000000));
					}
				}
			} catch (error) {
				logger.error(`QueueService: IPC or network failure fetching AppID ${appId} for ${streamId}.`, error);

				const errorString = String(error).toLowerCase();
				const isRateLimit =
					errorString.includes('429') || errorString.includes('500') || errorString.includes('timeout') || errorString.includes('internal server error');

				if (isRateLimit) {
					this.handleRateLimit(streamId, Number(appId));
				} else {
					if (isHigh) this.highPriority.push(target);
					else this.lowPriority.push(target);
					await new Promise((r) => setTimeout(r, 1000000));
				}
			}

			await new Promise((r) => setTimeout(r, 500));
		}

		logger.info('QueueService: Processing complete or interrupted. Queue halted.');
		this.processing = false;
	}

	private handleRateLimit(streamId: string, appId: number) {
		this.streamStates[streamId] = 'RATE_LIMITED';
		if (!this.suspendedPool[streamId]) this.suspendedPool[streamId] = [];
		this.suspendedPool[streamId].push(appId);
		this.startRecoveryLoop();
	}

	private async startRecoveryLoop() {
		if (this.recovering) return;
		this.recovering = true;

		logger.info('QueueService: Starting background recovery subsystem.');

		while (Object.values(this.streamStates).includes('RATE_LIMITED')) {
			if (this.isDismounted) break;

			await new Promise((r) => setTimeout(r, 60000));

			if (this.isDismounted) break;

			for (const [streamId, state] of Object.entries(this.streamStates)) {
				if (state === 'RATE_LIMITED') {
					const pool = this.suspendedPool[streamId] || [];
					if (pool.length === 0) {
						this.streamStates[streamId] = 'HEALTHY';
						continue;
					}

					const testAppId = pool[0];
					if (testAppId === undefined) continue;

					logger.info(`QueueService: Testing recovery for stream ${streamId} with AppID ${testAppId}.`);

					try {
						const payload = { stream_id: streamId, app_id: testAppId.toString() };
						const raw = await fetchStreamData({ args_json: JSON.stringify(payload) });
						const res = JSON.parse(raw);

						if (res.success && res.result && !res.result.error) {
							logger.info(`QueueService: Stream ${streamId} recovered. Restoring suspended items.`);
							this.streamStates[streamId] = 'HEALTHY';

							const now = Math.floor(Date.now() / 1000);
							const newEntry = { data: res.result.data, fetchedAt: now };

							if (!this.cache[streamId]) this.cache[streamId] = {};
							this.cache[streamId][testAppId.toString()] = newEntry;

							try {
								const savePayload = { stream_id: streamId, new_data: { [testAppId]: newEntry } };
								await appendToCache({ args_json: JSON.stringify(savePayload) });
							} catch (e) {
								logger.error('QueueService: Failed to append recovery data to Lua cache', e);
							}

							pool.shift();
							for (const id of pool) {
								this.highPriority.push(`${streamId}:${id}`);
							}

							this.suspendedPool[streamId] = [];
							this.notify();
							this.startProcessing();
						} else {
							logger.warn(`QueueService: Stream ${streamId} is still rate limited.`);
						}
					} catch (error) {
						logger.warn(`QueueService: Stream ${streamId} test failed during recovery.`);
					}
				}
			}
		}

		logger.info('QueueService: Recovery complete or interrupted.');
		this.recovering = false;
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
