import { ReactNode } from 'react';

interface SortiumGridProps {
	children?: ReactNode;
}

export function SortiumGrid({ children }: SortiumGridProps) {
	return (
		<div
			className="sortium-custom-grid"
			style={{
				display: 'grid',
				gridTemplateColumns: 'repeat(auto-fill, 220px)',
				gridAutoRows: '330px',
				gap: '24px 16px',
				padding: '24px 32px',
				width: '100%',
				boxSizing: 'border-box',
			}}
		>
			{}
			<div style={{ backgroundColor: '#2a475e', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#66c0f4' }}>
				Placeholder Game 1
			</div>
			<div style={{ backgroundColor: '#2a475e', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#66c0f4' }}>
				Placeholder Game 2
			</div>
			<div style={{ backgroundColor: '#2a475e', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#66c0f4' }}>
				Placeholder Game 3
			</div>

			{children}
		</div>
	);
}
