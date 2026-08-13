import React, { useRef, useState, useEffect } from 'react';
import { showContextMenu, Menu, MenuItem, MenuSeparator, findModule } from '@steambrew/client';
import { getSettings, saveSettings, getAvailableStreams, DataStream, Metric } from '../services/settings';

function SubMenuTrigger({
	stream,
	metrics,
	menuClasses,
	onMetricSelect,
}: {
	stream: DataStream;
	metrics: Metric[];
	menuClasses: any;
	onMetricSelect: (id: string, dir: 'asc' | 'desc') => void;
}) {
	const [isActive, setIsActive] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleMouseEnter = () => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setIsActive(true);
	};

	const handleMouseLeave = () => {
		timeoutRef.current = setTimeout(() => {
			setIsActive(false);
		}, 150);
	};

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	return (
		<div
			role="menuitem"
			className={`${menuClasses.SubMenu} contextMenuItem ${isActive ? menuClasses.active : ''}`}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			style={{ position: 'relative' }}
		>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: '8px' }}>
				<div>{stream.tag || stream.name}</div>
				<div className={menuClasses.Arrow}>
					<svg viewBox="0 0 512 512" width="12" height="12" xmlns="http://www.w3.org/2000/svg">
						<path fill="currentColor" d="M175 458 411 270c8-6 8-22 0-28L175 54c-11-9-27-1-27 14v376c0 15 16 23 27 14z" />
					</svg>
				</div>
			</div>

			{isActive && (
				<div
					className={`${menuClasses.contextMenu} visible`}
					style={{
						position: 'absolute',
						top: '-6px',
						left: 'calc(100% + 4px)',
						marginTop: '0px',
						zIndex: 1000,
						boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
					}}
				>
					<Menu label={stream.tag || stream.name}>
						{metrics.map((metric) => (
							<MenuItem {...({ key: metric.id } as any)} onSelected={() => onMetricSelect(metric.id, metric.defaultDir)}>
								{metric.name}
							</MenuItem>
						))}
					</Menu>
				</div>
			)}
		</div>
	);
}

export function openSortiumContextMenu(event: React.MouseEvent | MouseEvent, onSortChange?: (metric: string, direction: 'asc' | 'desc') => void) {
	const menuClasses = findModule((m) => m.ContextMenuMouseOverlay) || {};
	const currentSettings = getSettings();
	const streams = getAvailableStreams();

	const handleMetricChange = (metricId: string, defaultDir: 'asc' | 'desc') => {
		saveSettings({
			...currentSettings,
			lastUsedMetric: metricId,
			sortDirection: defaultDir,
		});

		if (onSortChange) {
			onSortChange(metricId, defaultDir);
		}
	};

	const menuContent = (
		<Menu label="Sortium">
			{streams
				.filter((stream) => currentSettings.enabledStreams[stream.id] !== false)
				.map((stream, index, array) => {
					const validMetrics = stream.metrics.filter((metric) => currentSettings.enabledMetrics[metric.id] !== false);

					if (validMetrics.length === 0) return null;

					return (
						<React.Fragment {...({ key: stream.id } as any)}>
							<SubMenuTrigger stream={stream} metrics={validMetrics} menuClasses={menuClasses} onMetricSelect={handleMetricChange} />
							{index < array.length - 1 && <MenuSeparator />}
						</React.Fragment>
					);
				})}
		</Menu>
	);

	showContextMenu(menuContent, (event.currentTarget || event.target) as EventTarget);
}
