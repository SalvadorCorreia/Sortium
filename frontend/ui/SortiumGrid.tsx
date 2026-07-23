import { ReactNode, useState, useRef, useLayoutEffect } from 'react';
import { findModule } from '@steambrew/client';
import { SortiumDropdown } from './SortiumDropdown';
import { SortiumCapsule } from './SortiumCapsule';
import { getSettings } from '../services/settings';

interface SortiumGridProps {
	children?: ReactNode;
	popup?: any;
}

export function SortiumGrid({ children, popup }: SortiumGridProps) {
	const collectionModule = findModule((m) => m.GridWithControls && m.CollectionOptions) || {};
	const yourCollectionModule = findModule((m) => m.YourCollection) || {};
	const gridModule = findModule((m) => m.CSSGrid) || {};

	const settings = getSettings();
	const [isActive] = useState(settings.sortiumViewActive);

	const customGridRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const doc = popup ? popup.m_popup.document : document;
		const nativeGrid = doc.querySelector(`.${gridModule.CSSGrid}:not(.sortium-custom-grid)`) as HTMLElement;
		const customGrid = customGridRef.current;

		if (!nativeGrid || !customGrid) return;

		customGrid.style.cssText = nativeGrid.style.cssText;

		const observer = new MutationObserver(() => {
			if (nativeGrid.style.cssText !== customGrid.style.cssText) {
				customGrid.style.cssText = nativeGrid.style.cssText;
			}
		});

		observer.observe(nativeGrid, {
			attributes: true,
			attributeFilter: ['style'],
		});

		return () => observer.disconnect();
	}, [gridModule.CSSGrid, popup]);

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

			<div className="CSSGrid_Measure"></div>

			<div className={`${gridModule.Container} Panel`}>
				<div style={{ width: '100%', height: '0px' }}></div>

				<div ref={customGridRef} role="grid" className={`${gridModule.CSSGrid} ${yourCollectionModule.YourCollection} Panel sortium-custom-grid`}>
					<div role="row" aria-rowindex={1} style={{ display: 'contents' }}>
						<SortiumCapsule title="Test Game 1" metricText="10 Hours" />
						<SortiumCapsule title="Test Game 2" metricText="15 Hours" />
						<SortiumCapsule title="Test Game 3" metricText="20 Hours" />
						<SortiumCapsule title="Test Game 4" metricText="25 Hours" />
						<SortiumCapsule title="Test Game 5" metricText="30 Hours" />
						{children}
					</div>
				</div>

				<div style={{ width: '100%', height: '0px' }}></div>
			</div>
		</div>
	);
}
