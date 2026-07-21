import { Millennium, definePlugin, IconsModule, sleep } from '@steambrew/client';
import { initSettings, getSettings } from './services/settings';
import SettingsMenu from './ui/SettingsMenu';
import { logger } from './services/logger';
import { injectHomeDropdowns, injectCollectionToggle, injectSortiumGrid } from './utils/injectors';

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

		MainWindowBrowserManager.m_browser.on('finished-request', async (currentURL: any, previousURL: any) => {
			void currentURL;
			void previousURL;

			const settings = getSettings();

			try {
				if (MainWindowBrowserManager.m_lastLocation.pathname === '/library/home' && settings.enableLibraryButton) {
					await injectHomeDropdowns(popup);
				} else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith('/library/collection/') && settings.enableCollectionButton) {
					await injectCollectionToggle(popup);
					await injectSortiumGrid(popup);
				}
			} catch (err) {
				logger.error('Failed to inject UI on navigation:', err);
			}
		});
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
