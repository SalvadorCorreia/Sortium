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
	await sleep(1000);
	if (popup.m_strName === 'SP Desktop_uid0') {
		var mwbm = undefined;
		while (!mwbm) {
			logger.info('Waiting for MainWindowBrowserManager');
			try {
				mwbm = MainWindowBrowserManager;
			} catch {
				await sleep(100);
			}
		}

		logger.info('Registering finished-request callback');
		MainWindowBrowserManager.m_browser.on('finished-request', async (currentURL: any, previousURL: any) => {
			void currentURL;
			void previousURL;

			const settings = getSettings();
			logger.info(`Navigation detected. Path: ${MainWindowBrowserManager.m_lastLocation.pathname}`);

			try {
				if (MainWindowBrowserManager.m_lastLocation.pathname === '/library/home' && settings.enableLibraryButton) {
					logger.info('Injecting Library Home UI...');
					await injectHomeDropdowns(popup);
					logger.info('Injection successful.');
				} else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith('/library/collection/') && settings.enableCollectionButton) {
					logger.info('Injecting Collection UI...');
					await injectCollectionToggle(popup);
					await injectSortiumGrid(popup);
					logger.info('Injection successful.');
				}
			} catch (err) {
				logger.error('Injection crashed:', err);
			}
		});
	}
}

export default definePlugin(() => {
	console.log('[Sortium] Frontend plugin registered.');

	Millennium.AddWindowCreateHook!(OnPopupCreation);

	return {
		title: 'Sortium',
		icon: <IconsModule.Settings />,
		content: <SettingsMenu />,
	};
});
