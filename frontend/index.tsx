import { Millennium, definePlugin, IconsModule, , sleep } from '@steambrew/client';
import SettingsMenu from './ui/SettingsMenu';
import { injectHomeDropdown, injectCollectionDropdown} from './utils/injectors.tsx';

declare global {
	var MainWindowBrowserManager: any;
}

async function OnPopupCreation(popup: any){
	await sleep(10000);
	if (popup.m_strName === "SP Desktop_uid0") {
		var mwbm = undefined;
		while (!mwbm){
			console.log("[Sortium] Waiting for MainWindowBrowserManager");
			try {
				mwbm = MainWindowBrowserManager;
			} catch {
				await sleep(100);
			}
		}

		console.log("[Sortium] Registering callback");
        MainWindowBrowserManager.m_browser.on("finished-request", async (currentURL: any, previousURL: any) => {
            void currentURL;
            void previousURL;

            if (MainWindowBrowserManager.m_lastLocation.pathname === "/library/home") {
                await injectHomeDropdown(popup);
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/collection/")) {
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
        content: <SettingsMenu />
    };
});
