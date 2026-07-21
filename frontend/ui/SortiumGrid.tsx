import { ReactNode, useState } from 'react';
import { findModule } from '@steambrew/client';
import { SortiumDropdown } from './SortiumDropdown';
import { getSettings } from '../services/settings';

interface SortiumGridProps {
	children?: ReactNode;
	popup?: any;
}

export function SortiumGrid({ children, popup }: SortiumGridProps) {
	const collectionModule = findModule((m) => m.GridWithControls && m.CollectionOptions) || {};

	const settings = getSettings();
	const [isActive] = useState(settings.sortiumViewActive);

	let containerStyle: React.CSSProperties = {
		display: 'flex',
		flexDirection: 'column',
		width: '100%',
	};

	if (!isActive) {
		containerStyle.height = '0px';
		containerStyle.overflow = 'hidden';
		containerStyle.visibility = 'hidden';
	}

	return (
		<div className={collectionModule.GridWithControls} style={containerStyle}>
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
