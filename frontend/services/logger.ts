let loggingEnabled = true;

/**
 * Toggles the internal logging state for the frontend application.
 * Consumes a boolean flag and modifies the behavior of the exported logger.
 */
export function setLoggingEnabled(enabled: boolean) {
	loggingEnabled = enabled;
}

const TAG = '[Sortium]';

/**
 * A centralized logging utility for the Sortium frontend.
 * Provides info, warn, and error methods that respect the user's logging preferences.
 */
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
