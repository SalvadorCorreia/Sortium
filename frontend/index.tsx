import { Millennium, findModule, sleep } from '@steambrew/client';
import { createRoot } from 'react-dom/client';
import { IconsModule, definePlugin } from '@steambrew/client';
import { SortiumDropdown } from './ui/SortiumDropdown.tsx';
import SettingsMenu from './ui/SettingsMenu';

declare global {
	var MainWindowBrowserManager: any;
}

const WaitForElement = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))][0];


async function renderHome(popup: any) {
    const headerDiv = await WaitForElement(`div.${findModule(e => e.ShowcaseHeader).ShowcaseHeader}`, popup.m_popup.document);
    const oldSortiumDropdown = headerDiv.querySelector('div.sortium-dropdown');
    if (!oldSortiumDropdown) {
        const sortiumDropdown = popup.m_popup.document.createElement("div");
        sortiumDropdown.className ="sortium-dropdown";

        const sortiumRoot = createRoot(sortiumDropdown);
        sortiumRoot.render(<SortiumDropdown />);

        headerDiv.insertBefore(sortiumDropdown, headerDiv.firstChild!.nextSibling);
    }
}

async function renderCollection(popup: any) {
    const collOptionsDiv = await WaitForElement(`div.${findModule(e => e.CollectionOptions).CollectionOptions}`, popup.m_popup.document);
    const oldSortiumDropdown = collOptionsDiv.querySelector('div.sortium-dropdown');
    if (!oldSortiumDropdown) {
        const sortiumDropdown = popup.m_popup.document.createElement("div");
        sortiumDropdown.className ="sortium-dropdown";

        const sortiumRoot = createRoot(sortiumDropdown);
        sortiumRoot.render(<SortiumDropdown />);

        collOptionsDiv.insertBefore(sortiumDropdown, collOptionsDiv.firstChild!.nextSibling);
    }
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
                await renderHome(popup);
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/collection/")) {
                await renderCollection(popup);
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
