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

class QueueService {
	private cache: Record<string, Record<string, CacheEntry>> = {};
	private highPriority: Set<string> = new Set();
	private lowPriority: Set<string> = new Set();
	private processing = false;
	private listeners: Set<() => void> = new Set();

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

			if (!entry || age > hardLimit) {
				if (!this.highPriority.has(`${streamId}:${id}`)) {
					this.highPriority.add(`${streamId}:${id}`);
					addedHigh++;
				}
			} else if (age > softLimit) {
				if (!this.lowPriority.has(`${streamId}:${id}`)) {
					this.lowPriority.add(`${streamId}:${id}`);
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

		while (this.highPriority.size > 0 || this.lowPriority.size > 0) {
			let target: string | undefined;
			let isHigh = false;

			if (this.highPriority.size > 0) {
				target = this.highPriority.values().next().value;
				if (target) this.highPriority.delete(target);
				isHigh = true;
			} else {
				target = this.lowPriority.values().next().value;
				if (target) this.lowPriority.delete(target);
			}

			if (!target) continue;

			const parts = target.split(':');
			const streamId = parts[0];
			const appId = parts[1];

			if (!streamId || !appId) continue;

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

					logger.info(`QueueService: Fetched ${appId} for ${streamId}. Remaining tasks: ${this.highPriority.size + this.lowPriority.size}`);
					this.notify();
				} else {
					const errorReason = res.error || (res.result && res.result.details) || 'Unknown backend error';
					logger.warn(`QueueService: Paused due to fetch error on AppID ${appId} for ${streamId}. Reason: ${errorReason}. Backing off.`);

					if (isHigh) this.highPriority.add(target);
					else this.lowPriority.add(target);

					await new Promise((r) => setTimeout(r, 5000));
				}
			} catch (error) {
				logger.error(`QueueService: IPC or network failure fetching AppID ${appId} for ${streamId}.`, error);
				if (isHigh) this.highPriority.add(target);
				else this.lowPriority.add(target);

				await new Promise((r) => setTimeout(r, 5000));
			}

			await new Promise((r) => setTimeout(r, 500));
		}

		logger.info('QueueService: Processing complete. Queue is empty.');
		this.processing = false;
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
