import { findModule } from "@steambrew/client";

/**
 * Dynamically resolves Steam's obfuscated Webpack class names.
 * Consumes no arguments, returns an object containing active CSS class strings, and has no side effects.
 */
export function getLibrarySelectors() {
    // Valve aggressively hashes class names (e.g., ShowcaseHeader_2df3a) during updates.
    // Querying the module registry at runtime guarantees our layout hooks never break.
    return {
        showcaseHeader: findModule((e: any) => e.ShowcaseHeader)?.ShowcaseHeader as string,
        collectionOptions: findModule((e: any) => e.CollectionOptions)?.CollectionOptions as string
    };
}

/**
 * Formats a valid DOM query string using a dynamically resolved Webpack module.
 * Consumes a base Webpack class string, returns a standard CSS class selector string (`.className`).
 */
export function formatAsSelector(webpackClass: string): string {
    // findModule returns the raw class name without the dot prefix.
    // We format it here to prevent string-manipulation bugs from leaking into the UI mounting logic.
    return `.${webpackClass}`;
}
