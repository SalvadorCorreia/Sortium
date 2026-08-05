import { Field, ToggleField, DialogControlsSection, DialogControlsSectionHeader, Dropdown } from '@steambrew/client';
import { useState, useEffect } from 'react';
import { logger } from '../services/logger';
import { initSettings, getSettings, getAvailableStreams, saveSettings, clearCache, type PluginSettings, type DataStream } from '../services/settings';
import { queueService } from '../services/queue';

export default function SettingsMenu() {
	const [settings, setSettingsState] = useState<PluginSettings | null>(null);
	const [streams, setStreams] = useState<DataStream[]>([]);
	const [isConfirmingClear, setIsConfirmingClear] = useState(false);

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

	const updateMenuStyle = async (value: string) => {
		const newSettings = { ...settings, menuStyle: value as 'dropdown' | 'context' };
		setSettingsState(newSettings);
		await saveSettings(newSettings);
	};

	const toggleSortiumViewActive = async (checked: boolean) => {
		const newSettings = { ...settings, sortiumViewActive: checked };
		setSettingsState(newSettings);
		await saveSettings(newSettings);
	};

	const toggleLogging = async (checked: boolean) => {
		const newSettings = { ...settings, enableLogging: checked };
		setSettingsState(newSettings);
		await saveSettings(newSettings);
	};

	const toggleLibraryButton = async (checked: boolean) => {
		const newSettings = { ...settings, enableLibraryButton: checked };
		setSettingsState(newSettings);
		await saveSettings(newSettings);
	};

	const toggleCollectionButton = async (checked: boolean) => {
		const newSettings = { ...settings, enableCollectionButton: checked };
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
			logger.info('Sortium Cache cleared successfully.');
		} else {
			logger.error('Failed to clear Sortium Cache.');
		}
		setIsConfirmingClear(false);
	};

	const executeForceSync = () => {
		const currentMetric = settings?.lastUsedMetric || streams[0]?.metrics[0]?.id || '';
		if (currentMetric) {
			queueService.forceSyncLibrary(currentMetric);
		}
	};

	return (
		<>
			<DialogControlsSection>
				<DialogControlsSectionHeader>User Interface</DialogControlsSectionHeader>
				<div style={{ marginBottom: '16px', color: '#8f98a0', fontSize: '13px' }}>Choose where the Sortium sorting button should be injected within Steam.</div>

				<Field label="Sorting Menu Style" description="How the sorting options are presented in the library." bottomSeparator="standard">
					<div style={{ width: '220px' }}>
						<Dropdown
							rgOptions={[
								{ label: 'Standard Dropdown', data: 'dropdown' },
								{ label: 'Context Menu (Categories)', data: 'context' },
							]}
							selectedOption={settings.menuStyle}
							onChange={(opt) => updateMenuStyle(opt.data)}
						/>
					</div>
				</Field>
				<ToggleField
					label="Enable Sortium View by Default"
					description="Automatically activate the custom Sortium grid when opening collections."
					checked={settings.sortiumViewActive}
					onChange={toggleSortiumViewActive}
					bottomSeparator="standard"
				/>
				<ToggleField
					label="Enable Library Button"
					description="Show the sorting button on the main Library home page."
					checked={settings.enableLibraryButton}
					onChange={toggleLibraryButton}
					bottomSeparator="standard"
				/>
				<ToggleField
					label="Enable Collection Button"
					description="Show the sorting button inside individual Collections."
					checked={settings.enableCollectionButton}
					onChange={toggleCollectionButton}
					bottomSeparator="standard"
				/>
			</DialogControlsSection>

			<DialogControlsSection>
				<DialogControlsSectionHeader>Data Streams & Metrics</DialogControlsSectionHeader>
				<div style={{ marginBottom: '16px', color: '#8f98a0', fontSize: '13px' }}>Select which data sources and specific metrics to display in your sorting menu.</div>

				{streams.map((stream) => {
					const isStreamEnabled = settings.enabledStreams[stream.id] !== false;

					return (
						<div key={stream.id} style={{ marginBottom: '24px' }}>
							<ToggleField
								label={stream.name}
								checked={isStreamEnabled}
								onChange={(checked) => toggleStreamMaster(stream.id, checked)}
								bottomSeparator={isStreamEnabled ? 'none' : 'standard'}
							/>

							{isStreamEnabled && (
								<div style={{ marginLeft: '24px', marginTop: '8px', borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '16px' }}>
									{stream.metrics.map((metric) => (
										<ToggleField
											label={metric.name}
											checked={settings.enabledMetrics[metric.id] !== false}
											onChange={(checked) => toggleMetric(metric.id, checked)}
											bottomSeparator="none"
										/>
									))}
								</div>
							)}
						</div>
					);
				})}
			</DialogControlsSection>

			<DialogControlsSection>
				<DialogControlsSectionHeader>Data Management</DialogControlsSectionHeader>
				<Field
					label="Soft Cache Expiration (Days)"
					description="Data older than this will be fetched quietly in the background without blocking the UI."
					bottomSeparator="standard"
				>
					<input
						type="number"
						min="1"
						value={settings.softCacheDays}
						onChange={updateSoftCacheDays}
						style={{
							width: '60px',
							padding: '6px 8px',
							background: 'rgba(0, 0, 0, 0.25)',
							color: 'white',
							border: '1px solid rgba(255, 255, 255, 0.1)',
							borderRadius: '4px',
							outline: 'none',
						}}
					/>
				</Field>
				<Field
					label="Hard Cache Expiration (Days)"
					description="Data older than this will be treated as missing and force a UI loading state until fetched."
					bottomSeparator="standard"
				>
					<input
						type="number"
						min="1"
						value={settings.hardCacheDays}
						onChange={updateHardCacheDays}
						style={{
							width: '60px',
							padding: '6px 8px',
							background: 'rgba(0, 0, 0, 0.25)',
							color: 'white',
							border: '1px solid rgba(255, 255, 255, 0.1)',
							borderRadius: '4px',
							outline: 'none',
						}}
					/>
				</Field>
				<Field label="Force Sync Library" description="Pushes all cached games into the background fetch queue immediately." bottomSeparator="standard">
					<button
						onClick={executeForceSync}
						style={{
							padding: '6px 12px',
							background: '#3d4450',
							color: 'white',
							border: 'none',
							borderRadius: '4px',
							cursor: 'pointer',
							fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif',
							fontSize: '13px',
						}}
					>
						Force Sync
					</button>
				</Field>
				<Field label="Clear Local Cache" description="Force the plugin to delete all stored game data." bottomSeparator="standard">
					{!isConfirmingClear ? (
						<button
							onClick={() => setIsConfirmingClear(true)}
							style={{
								padding: '6px 12px',
								background: '#3d4450',
								color: 'white',
								border: 'none',
								borderRadius: '4px',
								cursor: 'pointer',
								fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif',
								fontSize: '13px',
							}}
						>
							Clear Cache
						</button>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
							<span style={{ color: '#ff5c5c', fontSize: '12px', fontWeight: 'bold' }}>
								Are you sure? This will significantly slow down sorting until data is re-fetched.
							</span>
							<div style={{ display: 'flex', gap: '8px' }}>
								<button
									onClick={() => setIsConfirmingClear(false)}
									style={{
										padding: '6px 12px',
										background: '#3d4450',
										color: 'white',
										border: 'none',
										borderRadius: '4px',
										cursor: 'pointer',
										fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif',
										fontSize: '13px',
									}}
								>
									Cancel
								</button>
								<button
									onClick={executeClearCache}
									style={{
										padding: '6px 12px',
										background: '#d94141',
										color: 'white',
										border: 'none',
										borderRadius: '4px',
										cursor: 'pointer',
										fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif',
										fontSize: '13px',
										fontWeight: 'bold',
									}}
								>
									Confirm Delete
								</button>
							</div>
						</div>
					)}
				</Field>
			</DialogControlsSection>

			<DialogControlsSection>
				<DialogControlsSectionHeader>Advanced & Debugging</DialogControlsSectionHeader>
				<ToggleField
					label="Enable Developer Logging"
					description="Print debug information to the Millennium developer console."
					checked={settings.enableLogging}
					onChange={toggleLogging}
					bottomSeparator="standard"
				/>
				<Field label="Sortium View State" description={settings.sortiumViewActive ? 'Active' : 'Inactive'} bottomSeparator="standard" />
				<Field label="Last Used Metric" description={settings.lastUsedMetric || 'None'} bottomSeparator="none" />
			</DialogControlsSection>
		</>
	);
}
