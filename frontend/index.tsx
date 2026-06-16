import { Millennium, definePlugin, IconsModule, sleep } from '@steambrew/client';
import SettingsMenu from './ui/SettingsMenu';
import { injectHomeDropdowns, injectCollectionDropdown } from './utils/injectors';
import { initSettings, getSettings } from './services/settings';

declare global {
	var MainWindowBrowserManager: any;
}

async function OnPopupCreation(popup: any) {
	await initSettings();
	await sleep(1000);
	if (popup.m_strName === 'SP Desktop_uid0') {
		var mwbm = undefined;
		while (!mwbm) {
			console.log('[Sortium] Waiting for MainWindowBrowserManager');
			try {
				mwbm = MainWindowBrowserManager;
			} catch {
				await sleep(100);
			}
		}

		console.log('[Sortium] Registering callback');
		MainWindowBrowserManager.m_browser.on('finished-request', async (currentURL: any, previousURL: any) => {
			void currentURL;
			void previousURL;

			const settings = getSettings();

			if (MainWindowBrowserManager.m_lastLocation.pathname === '/library/home' && settings.enableLibraryButton) {
				await injectHomeDropdowns(popup);
			} else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith('/library/collection/') && settings.enableCollectionButton) {
				await injectCollectionDropdown(popup);
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
