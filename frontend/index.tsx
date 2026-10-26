import { Millennium, definePlugin, IconsModule, sleep } from '@steambrew/client';
import { initSettings, getSettings } from './services/settings';
import SettingsMenu from './ui/SettingsMenu';
import { logger } from './services/logger';
import { /* injectHomeDropdowns, */ injectCollectionToggle, injectSortiumGrid, injectNativeSortingDropdown, cleanupInjectors } from './utils/injectors';
import { queueService } from './services/queue';

declare global {
	var MainWindowBrowserManager: any;
}

let isDismounted = false;
let historyUnsubscribe: (() => void) | null = null;

async function OnPopupCreation(popup: any) {
	await initSettings();

	if (popup.m_strName === 'SP Desktop_uid0') {
		injectNativeSortingDropdown();

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

		logger.info('Steam UI stable. Navigation listeners registered.');

		const handleNavigation = async (path: string) => {
			if (isDismounted) return;
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

		historyUnsubscribe = MainWindowBrowserManager.m_history.listen((location: any) => {
			handleNavigation(location.pathname);
		});

		handleNavigation(MainWindowBrowserManager.m_lastLocation.pathname);
	}
}

/**
 * Entry point for the Sortium frontend plugin within the Steam Millennium framework.
 * Consumes a plugin setup callback and returns plugin metadata and teardown hooks.
 * Hooks window creation to initialize settings and inject UI components upon navigation.
 */
export default definePlugin(() => {
	logger.info('Frontend plugin registered.');

	isDismounted = false;

	initSettings().then(() => {
		if (!isDismounted) {
			injectNativeSortingDropdown();
		}
	});

	Millennium.AddWindowCreateHook!(OnPopupCreation);

	return {
		title: 'Sortium',
		icon: <IconsModule.Settings />,
		content: <SettingsMenu />,
		onDismount() {
			isDismounted = true;
			if (historyUnsubscribe) {
				historyUnsubscribe();
				historyUnsubscribe = null;
			}
			queueService.dismount();
			cleanupInjectors();
			logger.info('Frontend plugin dismounted.');
		},
	};
});
