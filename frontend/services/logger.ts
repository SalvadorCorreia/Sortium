import { getSettings } from '../services/settings';

const TAG = '[Sortium]';

export const logger = {
	info: (...args: any[]) => {
		if (getSettings().enableLogging) {
			console.log(TAG, ...args);
		}
	},
	warn: (...args: any[]) => {
		if (getSettings().enableLogging) {
			console.warn(TAG, ...args);
		}
	},
	error: (...args: any[]) => {
		console.error(TAG, ...args);
	},
};
