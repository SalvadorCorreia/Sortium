import { Millennium } from "@steambrew/client";

/**
 * Consumes a CSS selector and optional context constraints to wait for an element's rendering.
 * Returns a Promise resolving to the first matched Element, or undefined on timeout/failure.
 * Side effect: Suspends execution via Millennium's native element observer until the target mounts.
 *
 * @param selector The target CSS selector string.
 * @param parent The root element to observe (defaults to global document).
 * @param timeoutMs Maximum observation time in milliseconds.
 */
export async function waitForElement(
    selector: string,
    parent: Document | Element = document,
    timeoutMs?: number
): Promise<Element | undefined> {
    try {
        const elements = timeoutMs
            ? await Millennium.findElement(parent, selector, timeoutMs)
            : await Millennium.findElement(parent, selector);

        return [...elements][0];
    } catch (error) {
        // Millennium throws an exception if the timeout is reached or the selector is invalid.
        // Catching it ensures the plugin fails gracefully without crashing Steam's React thread.
        console.error(`[Sortium] Failed while waiting for DOM element '${selector}':`, error);
        return undefined;
    }
}
