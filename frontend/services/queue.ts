import { callable } from '@steambrew/client';
import { getSettings } from './settings';
import { logger } from './logger';

const getCacheBatch = callable<[{ args_json: string }], string>('GetCacheBatch');
const appendToCache = callable<[{ args_json: string }], string>('AppendToCache');
const fetchStreamData = callable<[{ args_json: string }], string>('FetchStreamData');
const getAvailableStreams = callable<[], string>('GetAvailableStreams');

declare global {
	var appStore: any;
}

export type AppState = 'MISSING' | 'BATCHING' | 'QUEUED' | 'FETCHING' | 'CACHED' | 'ERROR_CACHE';

export interface CacheEntry {
	state: AppState;
	data: any;
	fetchedAt: number;
	failCount: number;
}

class QueueService {
	private cache: Record<string, Record<string, CacheEntry>> = {};

	private highPriority: Record<string, string[]> = {};
	private lowPriority: Record<string, string[]> = {};

	private isRateLimited: Record<string, boolean> = {};
	private processingStreams: Set<string> = new Set();
	private recoveringStreams: Set<string> = new Set();

	private pendingSaves: Record<string, Record<string, any>> = {};
	private saveTimers: Record<string, any> = {};

	private streamDelays: Record<string, number> | null = null;
	private listeners: Set<() => void> = new Set();
	private isDismounted = false;

	private async getDelay(streamId: string): Promise<number> {
		if (!this.streamDelays) {
			this.streamDelays = {};
			try {
				const raw = await getAvailableStreams();
				const res = JSON.parse(raw);
				if (res.success && res.data) {
					res.data.forEach((s: any) => { this.streamDelays![s.id] = s.delay; });
				}
			} catch (e) {
				return 500;
			}
		}
		return this.streamDelays[streamId] || 500;
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

	public getStreamState(streamId: string): string {
		return this.isRateLimited[streamId] ? 'RATE_LIMITED' : 'HEALTHY';
	}

	private getEntry(streamId: string, appId: string): CacheEntry {
		if (!this.cache[streamId]) this.cache[streamId] = {};
		if (!this.cache[streamId][appId]) {
			this.cache[streamId][appId] = { state: 'MISSING', data: null, fetchedAt: 0, failCount: 0 };
		}
		return this.cache[streamId][appId];
	}

	public getCachedData(streamId: string, appId: number): any {
		const entry = this.cache[streamId]?.[appId.toString()];
		return entry?.state === 'CACHED' ? entry.data : null;
	}

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

	public async enqueue(appIds: number[], metric: string) {
		const streamId = metric.split('_')[0] || 'hltb';
		const stringIds = appIds.map(String);

		if (!this.highPriority[streamId]) this.highPriority[streamId] = [];
		if (!this.lowPriority[streamId]) this.lowPriority[streamId] = [];

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
					if (age > 24 * 60 * 60) this.pushToQueue(streamId, id, true);
				} else if (age > hardLimit) {
					this.pushToQueue(streamId, id, true);
				} else if (age > softLimit) {
					this.pushToQueue(streamId, id, false);
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
							} else if (memEntry.state === 'CACHED' && age > softLimit) {
								this.pushToQueue(streamId, id, false);
							}
						} else {
							this.pushToQueue(streamId, id, true);
						}
					}
				}
			} catch (e) {
				logger.error(`QueueService [${streamId}]: GetCacheBatch failed`, e);
				for (const id of batch) this.pushToQueue(streamId, id, true);
			}
		}

		this.notify();
		if (!this.isRateLimited[streamId]) {
			this.startProcessing(streamId);
		}
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
						this.startRecoveryLoop(streamId);
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

	private async startRecoveryLoop(streamId: string) {
		if (this.recoveringStreams.has(streamId)) return;
		this.recoveringStreams.add(streamId);

		let sleepTime = 300;
		if (!this.highPriority[streamId]) this.highPriority[streamId] = [];
		if (!this.lowPriority[streamId]) this.lowPriority[streamId] = [];

		while (this.isRateLimited[streamId]) {
			if (this.isDismounted) break;

			await new Promise((r) => setTimeout(r, sleepTime * 1000));
			if (this.isDismounted) break;

			if (this.highPriority[streamId]!.length === 0 && this.lowPriority[streamId]!.length === 0) {
				this.isRateLimited[streamId] = false;
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
					this.notify();
					this.startProcessing(streamId);
					break;
				} else {
					const status = Number(res?.result?.status) || 0;
					if (status === 429 || status === 503) {
						entry.state = 'QUEUED';
						this.highPriority[streamId]!.push(appId);
						sleepTime = Math.min(sleepTime * 2, 1200);
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
						this.notify();
						this.startProcessing(streamId);
						break;
					}
				}
			} catch (e) {
				if (this.isDismounted) break;
				entry.state = 'QUEUED';
				this.highPriority[streamId]!.push(appId);
				sleepTime = Math.min(sleepTime * 2, 1200);
			}
		}

		this.recoveringStreams.delete(streamId);
	}

	public forceSyncLibrary(metric: string) {
		try {
			if (typeof appStore !== 'undefined' && appStore.m_mapApps) {
				const allAppIds = Array.from(appStore.m_mapApps.keys())
					.map(Number)
					.filter((id) => !isNaN(id));

				this.enqueue(allAppIds, metric);
			}
		} catch (error) {
			logger.error('Failed to force sync:', error);
		}
	}
}

export const queueService = new QueueService();
