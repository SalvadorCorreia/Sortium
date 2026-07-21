let loggingEnabled = true;

export function setLoggingEnabled(enabled: boolean) {
	loggingEnabled = enabled;
}

const TAG = '[Sortium]';

export const logger = {
	info: (...args: any[]) => {
		if (loggingEnabled) console.log(TAG, ...args);
	},
	warn: (...args: any[]) => {
		if (loggingEnabled) console.warn(TAG, ...args);
	},
	error: (...args: any[]) => {
		console.error(TAG, ...args);
	},
};
