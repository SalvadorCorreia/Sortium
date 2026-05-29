import { createLogger } from '../services/logger';
import type { SortiumDropdownOption } from '../services/streamConfig';

const logger = createLogger('ui');
const EMPTY_OPTION_FALLBACK: SortiumDropdownOption[] = [{ id: 'no-options', label: 'No streams configured', enabled: true }];

export interface SortiumDropdownProps {
options: SortiumDropdownOption[];
}

export function SortiumDropdown({ options }: SortiumDropdownProps) {
const safeOptions = options.length > 0 ? options : EMPTY_OPTION_FALLBACK;
const [selectedId, setSelectedId] = window.SP_REACT.useState<string>(safeOptions[0]?.id ?? '');

window.SP_REACT.useEffect(() => {
if (!safeOptions.some((option) => option.id === selectedId)) {
setSelectedId(safeOptions[0]?.id ?? '');
}
}, [safeOptions, selectedId]);

return (
<div className="sortium-dropdown-shell" title="Sortium custom sorting streams">
<span className="sortium-dropdown-label">Sortium</span>
<select
className="sortium-dropdown-select"
value={selectedId}
onChange={(event: { target: HTMLSelectElement }) => {
const nextValue = event.target.value;
setSelectedId(nextValue);
logger.info('Selected dropdown option', nextValue);
}}
>
{safeOptions.map((option) => (
<option key={option.id} value={option.id}>
{option.label}
</option>
))}
</select>
</div>
);
}
