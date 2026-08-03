import { useState, useEffect } from 'react';
import { findModule } from '@steambrew/client';
import { initSettings, getSettings, saveSettings } from '../services/settings';
import { logger } from '../services/logger';

interface SortiumToggleProps {
	popup?: any;
}

export function SortiumToggle({ popup }: SortiumToggleProps) {
	const [isActive, setIsActive] = useState(false);

	const activeColor = '#2d73ff';
	const inactiveColor = '#39424d';
	const textColorActive = '#ffffff';
	const textColorInactive = '#b8b6b4';

	useEffect(() => {
		let isMounted = true;
		initSettings().then(() => {
			if (isMounted) {
				setIsActive(getSettings().sortiumViewActive);
			}
		});
		return () => {
			isMounted = false;
		};
	}, []);

	useEffect(() => {
		if (!popup) return;

		const doc = popup.m_popup.document;
		const gridModule = findModule((m) => m.GridWithControls);

		if (!gridModule || !gridModule.GridWithControls) {
			logger.warn('GridWithControls module not found.');
			return;
		}

		let attempts = 0;
		const maxAttempts = 20;

		const interval = setInterval(() => {
			const grids = doc.querySelectorAll(`.${gridModule.GridWithControls}`);

			if (grids.length >= 2) {
				clearInterval(interval);

				const customGrid = grids[0] as HTMLElement;
				const nativeGrid = grids[1] as HTMLElement;

				if (isActive) {
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
			}

			attempts++;
			if (attempts >= maxAttempts) {
				clearInterval(interval);
			}
		}, 100);

		return () => clearInterval(interval);
	}, [isActive, popup]);

	const handleToggle = async () => {
		const nextState = !isActive;
		const currentSettings = getSettings();

		const updatedSettings = { ...currentSettings, sortiumViewActive: nextState };
		const success = await saveSettings(updatedSettings);

		if (success) {
			setIsActive(nextState);
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
