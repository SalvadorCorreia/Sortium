import { ReactNode, useState, useRef, useLayoutEffect, useEffect } from 'react';
import { findModule } from '@steambrew/client';
import { SortiumDropdown } from './SortiumDropdown';
import { SortiumCapsule } from './SortiumCapsule';
import { getSettings } from '../services/settings';
import { logger } from '../services/logger';
import { fetchAndSortApps, formatTime } from '../utils/sorting';

declare global {
	var uiStore: any;
	var collectionStore: any;
}

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
	const [appIds, setAppIds] = useState<number[]>([]);
	const [activeMetric, setActiveMetric] = useState<string>(settings.lastUsedMetric || 'hltb_main');

	const [sortedIds, setSortedIds] = useState<number[]>([]);
	const [metricData, setMetricData] = useState<Record<number, string>>({});

	const customGridRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (typeof uiStore !== 'undefined' && typeof collectionStore !== 'undefined') {
			const currentCollectionId = uiStore.currentGameListSelection?.strCollectionId;

			if (currentCollectionId) {
				const currentColl = collectionStore.GetCollection(currentCollectionId);
				if (currentColl && currentColl.allApps) {
					const ids = currentColl.allApps.map((app: any) => app.appid);
					setAppIds(ids);
				}
			}
		}
	}, []);

	useEffect(() => {
		if (appIds.length === 0) return;

		let isMounted = true;

		const loadData = async () => {
			try {
				const { sortedIds: newSortedIds, getSortValue } = await fetchAndSortApps(appIds, activeMetric);

				if (!isMounted) return;

				const formattedData: Record<number, string> = {};
				newSortedIds.forEach((id) => {
					formattedData[id] = formatTime(getSortValue(id));
				});

				setSortedIds(newSortedIds);
				setMetricData(formattedData);
			} catch (error) {
				logger.error('Failed to fetch data for collection', error);
			}
		};

		loadData();

		return () => {
			isMounted = false;
		};
	}, [appIds, activeMetric]);

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

	const displayIds = sortedIds.length > 0 ? sortedIds : appIds;

	return (
		<div className={collectionModule.GridWithControls} style={containerStyle}>
			<div className={`${collectionModule.CollectionOptions} Panel`}>
				<SortiumDropdown variant="collection" onSortChange={(metric) => setActiveMetric(metric)} />
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
						{displayIds.map((id) => (
							<div key={id} role="gridcell" style={{ display: 'contents' }}>
								<SortiumCapsule appId={id} metricText={metricData[id] || 'Loading...'} />
							</div>
						))}
						{children}
					</div>
				</div>

				<div style={{ width: '100%', height: '0px' }}></div>
			</div>
		</div>
	);
}
