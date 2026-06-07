import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { IconsModule, definePlugin } from '@steambrew/client';
import { initNavigationObserver } from './injection/observer';
import { getLibrarySelectors, formatAsSelector } from './injection/selectors';
import { waitForElement } from './injection/dom';
import SettingsMenu from './ui/SettingsMenu';
import { SortiumDropdown } from './ui/SortiumDropdown';

// Track the active React root to prevent memory leaks during rapid library navigation.
let activeRoot: Root | null = null;

/**
 * Mounts the Sortium UI into the Steam Library DOM.
 * Consumes the target CSS selector, returns nothing, and mutates the DOM by injecting a React root.
 */
async function injectSortiumUI(targetSelector: string): Promise<void> {
    const targetContainer = await waitForElement(targetSelector);
    if (!targetContainer) return;

    // Fast-fail if our component is already mounted to prevent infinite stacking on re-renders.
    if (targetContainer.querySelector('.sortium-injection-point')) return;

    // Explicitly unmount the old tree to ensure React frees up detached DOM nodes.
    if (activeRoot) {
        activeRoot.unmount();
        activeRoot = null;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'sortium-injection-point';
    
    // Most of Steam's top-level library containers use flexbox, making simple appends visually safe.
    targetContainer.appendChild(wrapper);

    activeRoot = createRoot(wrapper);
    activeRoot.render(<SortiumDropdown />);
}

export default definePlugin(() => {
    console.log('[Sortium] Frontend plugin registered.');

    const selectors = getLibrarySelectors();

    // The observer guarantees the DOM is settled before we attempt injection.
    initNavigationObserver((currentPath: string) => {
        if (currentPath === '/library/home') {
            injectSortiumUI(formatAsSelector(selectors.showcaseHeader));
        } else if (currentPath.startsWith('/library/collection/')) {
            injectSortiumUI(formatAsSelector(selectors.collectionOptions));
        }
    });

    return {
        title: 'Sortium',
        icon: <IconsModule.Settings />,
        content: <SettingsMenu />
    };
});
