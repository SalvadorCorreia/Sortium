import { Dropdown, findModule } from '@steambrew/client';
import { useState, useMemo } from 'react';
import { getSettings, saveSettings, getAvailableStreams } from '../services/settings';

interface SortiumDropdownProps {
	variant?: 'default' | 'collection';
	popup?: any;
	onSortChange?: (metric: string) => void;
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
					})),
			);
	}, [streams, currentSettings.enabledStreams, currentSettings.enabledMetrics]);

	const initialSelected = options.find((opt) => opt.data === currentSettings.lastUsedMetric)?.data || (options[0]?.data ?? '');
	const [selected, setSelected] = useState<string>(initialSelected);

	const handleChange = (option: { data: string; label: string }) => {
		const selectedData = option.data;
		setSelected(selectedData);
		saveSettings({ ...currentSettings, lastUsedMetric: selectedData });

		if (onSortChange) {
			onSortChange(selectedData);
		}
	};

	if (options.length === 0) {
		return null;
	}

	if (variant === 'collection') {
		const sortModule = findModule((m) => m.SortingDropDown && m.SortingDropDownLabel) || {};
		return (
			<div className={sortModule.SortingDropDown} tabIndex={-1}>
				<div className={sortModule.SortingDropDownLabel}>Sort By</div>
				<Dropdown rgOptions={options} selectedOption={selected} onChange={handleChange} />
			</div>
		);
	}

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
			<span style={{ color: '#b8b6b4', textTransform: 'uppercase', fontSize: '12px', fontWeight: 'bold' }}>Sortium</span>
			<Dropdown rgOptions={options} selectedOption={selected} onChange={handleChange} />
		</div>
	);
}
