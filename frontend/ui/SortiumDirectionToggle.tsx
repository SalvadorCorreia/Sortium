import { Focusable } from '@steambrew/client';

interface SortiumDirectionToggleProps {
	direction: 'asc' | 'desc';
	onToggle: () => void;
	className?: string;
}

/**
 * Renders a toggle button to switch between ascending and descending sort directions.
 * Consumes the current sort direction, a toggle click handler, and an optional native button class.
 */
export function SortiumDirectionToggle({ direction, onToggle, className }: SortiumDirectionToggleProps) {
	return (
		<Focusable
			onClick={onToggle}
			title={direction === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
			className={className}
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
