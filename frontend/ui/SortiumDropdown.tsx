import { Dropdown, findModule } from '@steambrew/client';
import { useState, useMemo } from 'react';
import { getSettings, saveSettings, getAvailableStreams } from '../services/settings';

interface SortiumDropdownProps {
	variant?: 'default' | 'collection';
	popup?: any;
	onSortChange?: (metric: string, direction: 'asc' | 'desc') => void;
}

export function SortiumDropdown({ variant = 'default', onSortChange }: SortiumDropdownProps) {
	const currentSettings = getSettings();
	const streams = getAvailableStreams();

	const options = useMemo(() => {
		return streams
			.filter((stream) => currentSettings.enabledStreams[stream.id] !== false)
			.flatMap((stream) =>
				stream.metrics
					.filter((metric) => currentSettings.enabledMetrics[metric.id] !== false)
					.map((metric) => ({
						label: `[${stream.tag || stream.name}] ${metric.name}`,
						data: metric.id,
						defaultDir: metric.defaultDir as 'asc' | 'desc',
					})),
			);
	}, [streams, currentSettings.enabledStreams, currentSettings.enabledMetrics]);

	const initialSelected = options.find((opt) => opt.data === currentSettings.lastUsedMetric)?.data || (options[0]?.data ?? '');
	const [selected, setSelected] = useState<string>(initialSelected);

	const handleMetricChange = (option: { data: string; label: string }) => {
		const selectedMetricId = option.data;
		const metricMeta = options.find((opt) => opt.data === selectedMetricId);
		const newDir = metricMeta?.defaultDir || 'asc';

		setSelected(selectedMetricId);

		saveSettings({
			...currentSettings,
			lastUsedMetric: selectedMetricId,
			sortDirection: newDir,
		});

		if (onSortChange) {
			onSortChange(selectedMetricId, newDir);
		}
	};

	if (options.length === 0) return null;

	if (variant === 'collection') {
		const sortModule = findModule((m) => m.SortingDropDown && m.SortingDropDownLabel) || {};
		return (
			<div className={sortModule.SortingDropDown} tabIndex={-1}>
				<div className={sortModule.SortingDropDownLabel}>Sort By</div>
				<Dropdown rgOptions={options} selectedOption={selected} onChange={handleMetricChange} />
			</div>
		);
	}

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
			<span style={{ color: '#b8b6b4', textTransform: 'uppercase', fontSize: '12px', fontWeight: 'bold' }}>Sortium</span>
			<Dropdown rgOptions={options} selectedOption={selected} onChange={handleMetricChange} />
		</div>
	);
}
