import { SORTIUM_LOG_PREFIX } from '../injection/constants';

function log(level: 'debug' | 'info' | 'warn' | 'error', scope: string, message: string, ...meta: unknown[]) {
const prefix = `${SORTIUM_LOG_PREFIX}[${scope}]`;
const logger = console[level] ?? console.log;
logger(prefix, message, ...meta);
}

export function createLogger(scope: string) {
return {
debug: (message: string, ...meta: unknown[]) => log('debug', scope, message, ...meta),
info: (message: string, ...meta: unknown[]) => log('info', scope, message, ...meta),
warn: (message: string, ...meta: unknown[]) => log('warn', scope, message, ...meta),
error: (message: string, ...meta: unknown[]) => log('error', scope, message, ...meta),
};
}
