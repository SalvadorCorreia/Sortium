import { Dropdown, findModule } from '@steambrew/client';
import { useState, useMemo, useEffect } from 'react';
import { getSettings, saveSettings, subscribeSettings } from '../services/settings';
import { getEnabledCustomMetricOptions } from '../utils/sorting';

interface SortiumDropdownProps {
	variant?: 'default' | 'collection';
	popup?: any;
	onSortChange?: (metric: string, direction: 'asc' | 'desc') => void;
}

/**
 * Renders a dropdown menu populated with enabled data stream metrics.
 * Consumes optional layout variant and sort change callback props.
 * Updates user settings on selection and triggers sorting changes in parent views.
 */
export function SortiumDropdown({ variant = 'default', onSortChange }: SortiumDropdownProps) {
	const [currentSettings, setCurrentSettings] = useState(() => getSettings());

	useEffect(() => {
		return subscribeSettings(() => {
			setCurrentSettings({ ...getSettings() });
		});
	}, []);

	const options = useMemo(() => {
		return getEnabledCustomMetricOptions();
	}, [currentSettings.enabledStreams, currentSettings.enabledMetrics]);

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
