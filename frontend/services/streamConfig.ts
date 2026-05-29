import rawConfig from '../config/streams.json';
import { createLogger } from './logger';

export interface SortiumDropdownOption {
id: string;
label: string;
enabled?: boolean;
}

interface SortiumStreamsConfig {
options?: SortiumDropdownOption[];
}

const logger = createLogger('config');

export function getSortiumDropdownOptions(): SortiumDropdownOption[] {
const parsed = rawConfig as SortiumStreamsConfig;
const options = Array.isArray(parsed.options) ? parsed.options : [];
const enabledOptions = options.filter((option) => option?.id?.trim() && option?.label?.trim() && option.enabled !== false);

if (enabledOptions.length === 0) {
logger.warn('No enabled options found in frontend/config/streams.json.');
}

return enabledOptions;
}
