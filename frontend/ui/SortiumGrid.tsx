import { ReactNode } from 'react';
import { findModule } from '@steambrew/client';
import { SortiumDropdown } from './SortiumDropdown';

interface SortiumGridProps {
	children?: ReactNode;
	popup?: any;
}

export function SortiumGrid({ children, popup }: SortiumGridProps) {
	const collectionModule = findModule((m) => m.GridWithControls && m.CollectionOptions) || {};

	return (
		<div className={collectionModule.GridWithControls} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
			<div className={`${collectionModule.CollectionOptions} Panel`}>
				<SortiumDropdown variant="collection" popup={popup} />
				<div className={collectionModule.CollectionOptionsRightJustified}></div>
			</div>

			<div>
				<div className={collectionModule.AppGridSectionHeader}>
					<div className={collectionModule.AppGridSectionLabel}></div>
					<div className={collectionModule.Rule}></div>
				</div>
			</div>

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
				<div style={{ backgroundColor: '#2a475e', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#66c0f4' }}>
					Placeholder Game 1
				</div>
				<div style={{ backgroundColor: '#2a475e', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#66c0f4' }}>
					Placeholder Game 2
				</div>
				{children}
			</div>
		</div>
	);
}
