import { Millennium, definePlugin, IconsModule, sleep } from '@steambrew/client';
import { initSettings } from './services/settings';
import SettingsMenu from './ui/SettingsMenu';
import { logger } from './services/logger';
import { injectNativeSortingDropdown, cleanupInjectors } from './utils/injectors';
import { queueService } from './services/queue';

declare global {
	var MainWindowBrowserManager: any;
}

let isDismounted = false;

async function OnPopupCreation(popup: any) {
	if (popup.m_strName === 'SP Desktop_uid0') {
		injectNativeSortingDropdown();
		await initSettings();

		while (true) {
			if (isDismounted) break;
			try {
				const path = MainWindowBrowserManager?.m_lastLocation?.pathname;
				if (path && path !== '/init' && path !== '/') {
					break;
				}
			} catch {}
			await sleep(100);
		}

		if (isDismounted) return;

		injectNativeSortingDropdown();
		logger.info('Steam UI stable. Native collection hooks active.');
	}
}

/**
 * Entry point for the Sortium frontend plugin within the Steam Millennium framework.
 * Consumes a plugin setup callback and returns plugin metadata and teardown hooks.
 * Hooks window creation to initialize settings and patch native Steam collection components.
 */
export default definePlugin(() => {
	logger.info('Frontend plugin registered.');

	isDismounted = false;
	injectNativeSortingDropdown();
	void initSettings();

	Millennium.AddWindowCreateHook!(OnPopupCreation);

	return {
		title: 'Sortium',
		icon: <IconsModule.Settings />,
		content: <SettingsMenu />,
		onDismount() {
			isDismounted = true;
			queueService.dismount();
			cleanupInjectors();
			logger.info('Frontend plugin dismounted.');
		},
	};
});
