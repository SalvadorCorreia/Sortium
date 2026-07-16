import { useState } from 'react';

interface SortiumToggleProps {
	initialState?: boolean;
}

export function SortiumToggle({ initialState = false }: SortiumToggleProps) {
	const [isActive, setIsActive] = useState(initialState);

	const activeColor = '#2d73ff';
	const inactiveColor = '#39424d';
	const textColorActive = '#ffffff';
	const textColorInactive = '#b8b6b4';

	return (
		<div
			onClick={() => setIsActive(!isActive)}
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: '32px',
				height: '32px',
				borderRadius: '4px',
				cursor: 'pointer',
				backgroundColor: isActive ? activeColor : inactiveColor,
				color: isActive ? textColorActive : textColorInactive,
				fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif',
				fontWeight: 'bold',
				fontSize: '16px',
				marginLeft: '8px',
				userSelect: 'none',
				transition: 'background-color 0.2s ease-in-out, color 0.2s ease-in-out',
				boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
			}}
			title={isActive ? 'Disable Sortium View' : 'Enable Sortium View'}
		>
			S
		</div>
	);
}
