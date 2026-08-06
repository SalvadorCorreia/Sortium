import { getSettings, saveSettings } from '../services/settings';

interface SortiumDirectionToggleProps {
	direction: 'asc' | 'desc';
	onDirectionChange: (newDir: 'asc' | 'desc') => void;
}

export function SortiumDirectionToggle({ direction, onDirectionChange }: SortiumDirectionToggleProps) {
	const toggleDirection = () => {
		const newDir = direction === 'asc' ? 'desc' : 'asc';
		const currentSettings = getSettings();

		saveSettings({
			...currentSettings,
			sortDirection: newDir,
		});

		if (onDirectionChange) {
			onDirectionChange(newDir);
		}
	};

	return (
		<div
			onClick={toggleDirection}
			title={direction === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: '28px',
				height: '28px',
				cursor: 'pointer',
				color: '#67707b',
				borderRadius: '3px',
				transition: 'background-color 0.2s, color 0.2s',
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
				e.currentTarget.style.color = '#ffffff';
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.backgroundColor = 'transparent';
				e.currentTarget.style.color = '#67707b';
			}}
		>
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
				{direction === 'asc' ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
			</svg>
		</div>
	);
}
