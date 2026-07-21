import { useState } from 'react';
import { findModule } from '@steambrew/client';
import { getSettings, saveSettings } from '../services/settings';
import { logger } from '../services/logger';

interface SortiumToggleProps {
	popup?: any;
}

export function SortiumToggle({ popup }: SortiumToggleProps) {
	const [isActive, setIsActive] = useState(getSettings().sortiumViewActive);

	const activeColor = '#2d73ff';
	const inactiveColor = '#39424d';
	const textColorActive = '#ffffff';
	const textColorInactive = '#b8b6b4';

	const handleToggle = async () => {
		const nextState = !isActive;

		if (!popup) {
			logger.warn('Popup context missing. Cannot execute toggle.');
			return;
		}

		const doc = popup.m_popup.document;
		const gridModule = findModule((m) => m.GridWithControls);

		if (gridModule && gridModule.GridWithControls) {
			const grids = doc.querySelectorAll(`.${gridModule.GridWithControls}`);

			const customGrid = grids[0] as HTMLElement;
			const nativeGrid = grids[1] as HTMLElement;

			if (nativeGrid && customGrid) {
				if (nextState) {
					nativeGrid.style.height = '0px';
					nativeGrid.style.overflow = 'hidden';
					nativeGrid.style.visibility = 'hidden';

					customGrid.style.removeProperty('height');
					customGrid.style.removeProperty('overflow');
					customGrid.style.removeProperty('visibility');
				} else {
					nativeGrid.style.removeProperty('height');
					nativeGrid.style.removeProperty('overflow');
					nativeGrid.style.removeProperty('visibility');

					customGrid.style.height = '0px';
					customGrid.style.overflow = 'hidden';
					customGrid.style.visibility = 'hidden';
				}
				const settings = getSettings();
				await saveSettings({ ...settings, sortiumViewActive: nextState });
				setIsActive(nextState);
			} else {
				logger.warn('Could not find one or both grids in the DOM. Toggle aborted.');
			}
		} else {
			logger.warn('Could not locate the GridWithControls module. Steam UI may have changed.');
		}
	};

	return (
		<div
			onClick={handleToggle}
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: '32px',
				height: '32px',
				borderRadius: '4px',
				cursor: 'pointer',
				backgroundColor: isActive ? activeColor : inactiveColor,
				color: isActive ? textColorActive : textColorInactive,
				fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif',
				fontWeight: 'bold',
				fontSize: '16px',
				marginRight: '8px',
				userSelect: 'none',
				transition: 'background-color 0.2s ease-in-out, color 0.2s ease-in-out',
				boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
			}}
			title={isActive ? 'Disable Sortium View' : 'Enable Sortium View'}
		>
			S
		</div>
	);
}
