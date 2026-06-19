import { Dropdown, findModule } from '@steambrew/client';
import { useState } from 'react';
import { getSettings, saveSettings } from '../services/settings';
import { fetchMultipleHltbData } from '../services/hltb';

declare global {
	var collectionStore: any;
	var uiStore: any;
}

interface SortiumDropdownProps {
	variant?: 'default' | 'collection';
}

export function SortiumDropdown({ variant = 'default' }: SortiumDropdownProps) {
	const currentSettings = getSettings();

	const [selected, setSelected] = useState<string>(currentSettings.lastUsedMetric || 'hltb_main');

	const options = [
		{ label: 'HLTB: Main Story', data: 'hltb_main' },
		{ label: 'HLTB: Main + Extras', data: 'hltb_extras' },
		{ label: 'HLTB: Completionist', data: 'hltb_completionist' },
		{ label: 'SteamHunters: Median', data: 'sh_median' },
	];

	const handleChange = async (option: { data: string; label: string }) => {
		const selectedData = option.data;
		setSelected(selectedData);
		saveSettings({ ...currentSettings, lastUsedMetric: selectedData });
		console.log('[Sortium] Sort category changed to:', selectedData);

		if (variant === 'collection') {
			const currentCollectionId = uiStore?.currentGameListSelection?.strCollectionId;

			if (currentCollectionId && collectionStore) {
				const currentColl = collectionStore.GetCollection(currentCollectionId);
				const appIds = currentColl.allApps.map((app: any) => app.appid);

				console.log(`[Sortium] Found ${appIds.length} AppIDs in collection:`, appIds);

				const hltbResults = await fetchMultipleHltbData(appIds);

				currentColl.allApps.sort((a: any, b: any) => {
					const getSortValue = (appId: string | number) => {
						const data = hltbResults[appId];
						if (!data) return Infinity;

						switch (selectedData) {
							case 'hltb_main':
								return data.story || Infinity;
							case 'hltb_extras':
								return data.extras || Infinity;
							case 'hltb_completionist':
								return data.complete || Infinity;
							default:
								return Infinity;
						}
					};

					return getSortValue(a.appid) - getSortValue(b.appid);
				});

				console.log('[Sortium] Collection sorted based on:', selectedData);
			}
		} else if (variant === 'default') {
			// TODO: Logic for the Library Home page showcases
			console.log('[Sortium] Home view sorting triggered.');
		}
	};

	// ------------------------------------------
	// RENDER LOGIC: Switch based on the variant
	// ------------------------------------------
	if (variant === 'collection') {
		const sortModule = findModule((m) => m.SortingDropDown && m.SortingDropDownLabel) || {};
		return (
			<div className={sortModule.SortingDropDown} tabIndex={-1}>
				<div className={sortModule.SortingDropDownLabel}>Sortium</div>
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
