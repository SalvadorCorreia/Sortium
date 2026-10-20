import { Millennium } from '@steambrew/client';

/**
 * Asynchronously waits for a single DOM element to appear within a given parent.
 * Consumes a CSS selector and returns the first matching element found.
 */
export const waitForElement = async (sel: string, parent = document) => [...(await Millennium.findElement(parent, sel))][0];

/**
 * Asynchronously waits for multiple DOM elements to appear within a given parent.
 * Consumes a CSS selector and returns an array of all matching elements.
 */
export const waitForAllElements = async (sel: string, parent = document) => {
	const elements = await Millennium.findElement(parent, sel);
	return Array.from(elements);
};
