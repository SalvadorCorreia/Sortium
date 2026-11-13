import {
	DialogBodyText,
	DialogButton,
	DialogControlsSection,
	DialogControlsSectionHeader,
	Field,
	TextField,
	Toggle,
} from '@steambrew/client';
import { useState, useEffect } from 'react';
import { logger } from '../services/logger';
import { initSettings, getSettings, getAvailableStreams, saveSettings, clearCache, type PluginSettings, type DataStream } from '../services/settings';
import { queueService } from '../services/queue';
import { formatProgressFeedback } from '../utils/sorting';

/**
 * Renders the Sortium configuration interface in the Steam client settings.
 * Allows managing data stream toggles, metric visibility, and cache operations.
 */
export default function SettingsMenu() {
	const [settings, setSettingsState] = useState<PluginSettings | null>(null);
	const [streams, setStreams] = useState<DataStream[]>([]);
	const [isConfirmingClear, setIsConfirmingClear] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncFeedback, setSyncFeedback] = useState<{ text: string; color: string } | null>(null);

	useEffect(() => {
		let isMounted = true;

		initSettings().then(() => {
			if (isMounted) {
				setSettingsState(getSettings());
				setStreams(getAvailableStreams());
			}
		});

		return () => {
			isMounted = false;
		};
	}, []);

	useEffect(() => {
		if (!settings || streams.length === 0) return;

		const enabledStreamIds = streams
			.filter((stream) => settings.enabledStreams[stream.id] !== false)
			.map((stream) => stream.id);

		if (enabledStreamIds.length === 0) return;

		let wasRunning = false;

		const updateFeedback = () => {
			const progress = queueService.getSyncProgress(enabledStreamIds);
			if (progress.isRunning || progress.totalPending > 0) {
				wasRunning = true;
				const feedback = formatProgressFeedback(progress, streams);
				setSyncFeedback({ text: feedback.text, color: feedback.color });
			} else if (wasRunning) {
				wasRunning = false;
				setSyncFeedback({ text: '✓ Complete: All games up to date', color: '#a4d007' });
			}
		};

		// Check if sync is already active on mount (e.g. user reopened settings)
		updateFeedback();

		// Subscribe to real-time queue progress
		const unsubscribe = queueService.subscribe(updateFeedback);

		// Live countdown tick while rate limited
		const interval = setInterval(() => {
			const progress = queueService.getSyncProgress(enabledStreamIds);
			if (progress.isRateLimited) {
				updateFeedback();
			}
		}, 1000);

		return () => {
			unsubscribe();
			clearInterval(interval);
		};
	}, [settings, streams]);

	if (!settings) {
		return <Field label="Loading Sortium Configuration..." />;
	}

	const toggleStreamMaster = async (streamId: string, checked: boolean) => {
		const newSettings = {
			...settings,
			enabledStreams: { ...settings.enabledStreams, [streamId]: checked },
		};
		setSettingsState(newSettings);
		await saveSettings(newSettings);
	};

	const toggleMetric = async (metricId: string, checked: boolean) => {
		const newSettings = {
			...settings,
			enabledMetrics: { ...settings.enabledMetrics, [metricId]: checked },
		};
		setSettingsState(newSettings);
		await saveSettings(newSettings);
	};

	const toggleLogging = async (checked: boolean) => {
		const newSettings = { ...settings, enableLogging: checked };
		setSettingsState(newSettings);
		await saveSettings(newSettings);
	};

	const updateSoftCacheDays = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = parseInt(e.target.value, 10);
		if (!isNaN(val) && val > 0) {
			const newSettings = { ...settings, softCacheDays: val };
			setSettingsState(newSettings);
			await saveSettings(newSettings);
		}
	};

	const updateHardCacheDays = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = parseInt(e.target.value, 10);
		if (!isNaN(val) && val > 0) {
			const newSettings = { ...settings, hardCacheDays: val };
			setSettingsState(newSettings);
			await saveSettings(newSettings);
		}
	};

	const executeClearCache = async () => {
		const success = await clearCache();
		if (success) {
			queueService.clearMemoryCache();
			logger.info('Sortium Cache cleared successfully.');
		} else {
			logger.error('Failed to clear Sortium Cache.');
		}
		setIsConfirmingClear(false);
	};

	const executeForceSync = async () => {
		if (!settings || streams.length === 0 || isSyncing) return;
		setIsSyncing(true);

		const enabledStreamIds = streams
			.filter((stream) => settings.enabledStreams[stream.id] !== false)
			.map((stream) => stream.id);

		if (enabledStreamIds.length === 0) {
			setSyncFeedback({ text: 'No streams enabled', color: '#ffc82c' });
			setIsSyncing(false);
			setTimeout(() => setSyncFeedback(null), 4000);
			return;
		}

		try {
			await queueService.syncLibrary(enabledStreamIds);
			const progress = queueService.getSyncProgress(enabledStreamIds);
			const feedback = formatProgressFeedback(progress, streams);
			setSyncFeedback({ text: feedback.text, color: feedback.color });
		} catch (error) {
			logger.error('Failed to execute force sync:', error);
			setSyncFeedback({ text: 'Sync failed', color: '#ff5555' });
		} finally {
			setIsSyncing(false);
		}
	};

	return (
		<>
			<DialogControlsSection>
				<DialogControlsSectionHeader>Data Streams & Metrics</DialogControlsSectionHeader>
				<DialogBodyText>
					Select which data sources and specific metrics to display in your sorting menu.
				</DialogBodyText>

				{streams.map((stream) => {
					const isStreamEnabled = settings.enabledStreams[stream.id] !== false;

					return (
						<div key={stream.id}>
							<Field
								label={stream.name}
								bottomSeparator={isStreamEnabled ? 'none' : 'standard'}
							>
								<Toggle
									value={isStreamEnabled}
									onChange={(checked) => toggleStreamMaster(stream.id, checked)}
								/>
							</Field>

							{isStreamEnabled &&
								stream.metrics.map((metric, idx) => (
									<Field
										key={metric.id}
										label={metric.name}
										indentLevel={1}
										bottomSeparator={idx === stream.metrics.length - 1 ? 'standard' : 'none'}
									>
										<Toggle
											value={settings.enabledMetrics[metric.id] !== false}
											onChange={(checked) => toggleMetric(metric.id, checked)}
										/>
									</Field>
								))}
						</div>
					);
				})}
			</DialogControlsSection>

			<DialogControlsSection>
				<DialogControlsSectionHeader>Data Management</DialogControlsSectionHeader>
				<Field
					label="Soft Cache Expiration (Days)"
					description="Data older than this will be fetched quietly in the background without blocking the UI."
					childrenLayout="below"
					inlineWrap="shift-children-below"
					bottomSeparator="standard"
				>
					<TextField
						mustBeNumeric
						rangeMin={1}
						value={String(settings.softCacheDays)}
						onChange={updateSoftCacheDays}
					/>
				</Field>
				<Field
					label="Hard Cache Expiration (Days)"
					description="Data older than this will be treated as missing and force a UI loading state until fetched."
					childrenLayout="below"
					inlineWrap="shift-children-below"
					bottomSeparator="standard"
				>
					<TextField
						mustBeNumeric
						rangeMin={1}
						value={String(settings.hardCacheDays)}
						onChange={updateHardCacheDays}
					/>
				</Field>
				<Field label="Force Sync Library" description="Pushes all cached games into the background fetch queue immediately." bottomSeparator="standard">
					<div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
						<DialogButton onClick={executeForceSync} disabled={isSyncing} style={{ paddingInline: '10px' }}>
							{isSyncing ? 'Evaluating...' : 'Force Sync'}
						</DialogButton>
						{syncFeedback && (
							<span style={{ fontSize: '13px', color: syncFeedback.color }}>
								{syncFeedback.text}
							</span>
						)}
					</div>
				</Field>
				<Field label="Clear Local Cache" description="Force the plugin to delete all stored game data." bottomSeparator="standard">
					{!isConfirmingClear ? (
						<DialogButton onClick={() => setIsConfirmingClear(true)} style={{ paddingInline: '10px' }}>
							Clear Cache
						</DialogButton>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
							<span style={{ color: '#ff5c5c', fontSize: '12px', fontWeight: 'bold' }}>
								Are you sure? This will significantly slow down sorting until data is re-fetched.
							</span>
							<div style={{ display: 'flex', gap: '8px' }}>
								<DialogButton onClick={() => setIsConfirmingClear(false)} style={{ paddingInline: '10px' }}>
									Cancel
								</DialogButton>
								<DialogButton
									onClick={executeClearCache}
									style={{ paddingInline: '10px' }}
								>
									Confirm Delete
								</DialogButton>
							</div>
						</div>
					)}
				</Field>
			</DialogControlsSection>

			<DialogControlsSection>
				<DialogControlsSectionHeader>Advanced & Debugging</DialogControlsSectionHeader>
				<Field
					label="Enable Developer Logging"
					description="Print debug information to the Millennium developer console."
					bottomSeparator="standard"
				>
					<Toggle value={settings.enableLogging} onChange={toggleLogging} />
				</Field>
				<Field label="Last Used Metric" description={settings.lastUsedMetric || 'None'} bottomSeparator="none" />
			</DialogControlsSection>
		</>
	);
}
