import { Dropdown, findModule } from '@steambrew/client';
import { useState } from 'react';
import { getSettings, saveSettings } from '../services/settings';
import { fetchMultipleHltbData } from '../services/hltb';
import { logger } from '../services/logger';

declare global {
	var collectionStore: any;
	var uiStore: any;
}

interface SortiumDropdownProps {
	variant?: 'default' | 'collection';
	popup?: any;
}

export function SortiumDropdown({ variant = 'default', popup }: SortiumDropdownProps) {
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

		if (variant === 'collection') {
			const currentCollectionId = uiStore?.currentGameListSelection?.strCollectionId;

			if (currentCollectionId && collectionStore) {
				const currentColl = collectionStore.GetCollection(currentCollectionId);
				const appIds = currentColl.allApps.map((app: any) => app.appid);

				logger.info(`Processing collection sorting for ${appIds.length} games...`);

				const hltbResults = await fetchMultipleHltbData(appIds);

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

				const sortedApps = [...currentColl.allApps]
					.sort((a: any, b: any) => getSortValue(a.appid) - getSortValue(b.appid))
					.map((app: any) => {
						const totalMinutes = getSortValue(app.appid);
						let timeFormatted = 'No data';

						if (totalMinutes !== Infinity) {
							const hours = Math.floor(totalMinutes / 60);
							const minutes = Math.round(totalMinutes % 60);
							timeFormatted = `${hours}h ${minutes}m`;
						}

						return {
							name: app.display_name || app.name || 'Unknown Game',
							time: timeFormatted,
							id: app.appid,
						};
					});

				logger.info(`Successfully sorted ${sortedApps.length} games. Ready for grid rendering.`);

				const collectionModule = findModule((m) => m.YourCollection);

				if (collectionModule && collectionModule.YourCollection && popup) {
					const nativeContainer = popup.m_popup.document.querySelector(`.${collectionModule.YourCollection}`) as HTMLElement;

					if (nativeContainer) {
						// Apply display: none!important to ensure Steam's React doesn't override it immediately
						nativeContainer.style.setProperty('display', 'none', 'important');
					} else {
						logger.warn('Native collection container not found in the DOM.');
					}
				} else {
					logger.warn('Could not locate the collection grid module in Steam.');
				}
			}
		} else if (variant === 'default') {
			// TODO: Logic for the Library Home page showcases
			logger.info('Home view sorting triggered (Not yet implemented).');
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
