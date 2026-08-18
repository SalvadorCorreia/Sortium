import { Millennium, definePlugin, IconsModule, sleep } from '@steambrew/client';
import { initSettings, getSettings } from './services/settings';
import SettingsMenu from './ui/SettingsMenu';
import { logger } from './services/logger';
import { /* injectHomeDropdowns, */ injectCollectionToggle, injectSortiumGrid } from './utils/injectors';

declare global {
	var MainWindowBrowserManager: any;
}

async function OnPopupCreation(popup: any) {
	await initSettings();

	if (popup.m_strName === 'SP Desktop_uid0') {
		while (true) {
			try {
				const path = MainWindowBrowserManager?.m_lastLocation?.pathname;
				if (path && path !== '/init' && path !== '/') {
					break;
				}
			} catch {}
			await sleep(100);
		}

		logger.info('Steam UI stable. Navigation listeners registered.');

		const handleNavigation = async (path: string) => {
			const settings = getSettings();
			try {
				if (path === '/library/home' && settings.enableLibraryButton && false) {
					// await injectHomeDropdowns(popup);
				} else if (path.startsWith('/library/collection/') && settings.enableCollectionButton) {
					await injectCollectionToggle(popup);
					await injectSortiumGrid(popup);
				}
			} catch (err) {
				logger.error('Failed to inject UI on navigation:', err);
			}
		};

		MainWindowBrowserManager.m_history.listen((location: any) => {
			handleNavigation(location.pathname);
		});

		handleNavigation(MainWindowBrowserManager.m_lastLocation.pathname);
	}
}

export default definePlugin(() => {
	logger.info('Frontend plugin registered.');

	Millennium.AddWindowCreateHook!(OnPopupCreation);

	return {
		title: 'Sortium',
		icon: <IconsModule.Settings />,
		content: <SettingsMenu />,
	};
});
