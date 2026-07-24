import { Dropdown, findModule } from '@steambrew/client';
import { useState } from 'react';
import { getSettings, saveSettings } from '../services/settings';

export const SORTIUM_OPTIONS = [
	{ label: 'HLTB: Main Story', data: 'hltb_main' },
	{ label: 'HLTB: Main + Extras', data: 'hltb_extras' },
	{ label: 'HLTB: Completionist', data: 'hltb_completionist' },
	{ label: 'SteamHunters: Median', data: 'sh_median' },
];

interface SortiumDropdownProps {
	variant?: 'default' | 'collection';
	popup?: any;
	onSortChange?: (metric: string) => void;
}

export function SortiumDropdown({ variant = 'default', onSortChange }: SortiumDropdownProps) {
	const currentSettings = getSettings();
	const [selected, setSelected] = useState<string>(currentSettings.lastUsedMetric || 'hltb_main');

	const handleChange = (option: { data: string; label: string }) => {
		const selectedData = option.data;

		setSelected(selectedData);
		saveSettings({ ...currentSettings, lastUsedMetric: selectedData });

		if (onSortChange) {
			onSortChange(selectedData);
		}
	};

	if (variant === 'collection') {
		const sortModule = findModule((m) => m.SortingDropDown && m.SortingDropDownLabel) || {};
		return (
			<div className={sortModule.SortingDropDown} tabIndex={-1}>
				<div className={sortModule.SortingDropDownLabel}>Sort By</div>
				<Dropdown rgOptions={SORTIUM_OPTIONS} selectedOption={selected} onChange={handleChange} />
			</div>
		);
	}

	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
			<span style={{ color: '#b8b6b4', textTransform: 'uppercase', fontSize: '12px', fontWeight: 'bold' }}>Sortium</span>
			<Dropdown rgOptions={SORTIUM_OPTIONS} selectedOption={selected} onChange={handleChange} />
		</div>
	);
}
