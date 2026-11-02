import { Focusable, findModule } from '@steambrew/client';

interface SortiumDirectionToggleProps {
	direction: 'asc' | 'desc';
	onToggle: () => void;
}

/**
 * Renders a toggle button to switch between ascending and descending sort directions.
 * Consumes the current sort direction and a toggle click handler.
 */
export function SortiumDirectionToggle({ direction, onToggle }: SortiumDirectionToggleProps) {
	const iconButtonModule = findModule((m) => m.IconButton) || {};

	return (
		<Focusable
			onClick={onToggle}
			title={direction === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
			className={iconButtonModule.IconButton}
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				cursor: 'pointer',
				background: 'transparent',
				border: 'none',
				padding: '0 0.5em',
				marginLeft: '4px',
				fontSize: '1em',
			}}
			children={
				<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					{direction === 'asc' ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
				</svg>
			}
		/>
	);
}
