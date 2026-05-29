import { createLogger } from '../services/logger';
import type { SortiumDropdownOption } from '../services/streamConfig';

const logger = createLogger('ui');

export interface SortiumDropdownProps {
options: SortiumDropdownOption[];
}

export function SortiumDropdown({ options }: SortiumDropdownProps) {
const [selectedId, setSelectedId] = window.SP_REACT.useState<string>(options[0]?.id ?? '');

window.SP_REACT.useEffect(() => {
if (!options.some((option) => option.id === selectedId)) {
setSelectedId(options[0]?.id ?? '');
}
}, [options, selectedId]);

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
{options.map((option) => (
<option key={option.id} value={option.id}>
{option.label}
</option>
))}
</select>
</div>
);
}
