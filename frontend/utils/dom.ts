import { Millennium } from '@steambrew/client';

export const waitForElement = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))][0];

