import { Millennium } from '@steambrew/client';

export const waitForElement = async (sel: string, parent = document) => [...(await Millennium.findElement(parent, sel))][0];

export const waitForAllElements = async (sel: string, parent = document) => {
	const elements = await Millennium.findElement(parent, sel);
	return Array.from(elements);
};
