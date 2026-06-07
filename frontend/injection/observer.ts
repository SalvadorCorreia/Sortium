import { Millennium, sleep } from "@steambrew/client";

/**
 * Initializes the Steam navigation observer to detect library state changes.
 * Consumes a callback function triggered upon library navigation, returns nothing, and binds a window creation hook as a side effect.
 */
export function initNavigationObserver(onLibraryLoad: (path: string) => void): void {
    Millennium.AddWindowCreateHook(async (popup: any) => {
        // Steam spawns multiple hidden windows (friends list, settings); we only want the primary desktop UI.
        if (popup.m_strName !== "SP Desktop_uid0") return;

        let mwbm: any = undefined;

        // Steam's core UI managers initialize asynchronously, forcing us to poll until the reference is attached to the global scope.
        while (!mwbm) {
            try {
                // @ts-ignore - MainWindowBrowserManager is injected into the global scope by Steam's internal Webpack bundle.
                mwbm = MainWindowBrowserManager; 
            } catch {
                await sleep(100);
            }
        }

        // Hooking 'finished-request' guarantees Steam's React router has finished mounting the DOM nodes before we attempt to manipulate them.
        mwbm.m_browser.on("finished-request", () => {
            const currentPath = mwbm.m_lastLocation?.pathname;

            if (currentPath === "/library/home" || currentPath?.startsWith("/library/collection/")) {
                onLibraryLoad(currentPath);
            }
        });
    });
}
