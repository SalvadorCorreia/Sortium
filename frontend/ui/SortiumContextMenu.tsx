import { Menu, MenuItem, MenuGroup, showContextMenu, Dropdown, findModule } from '@steambrew/client';
import { getAvailableStreams, getSettings, getMetricLabel } from '../services/settings';

export function triggerGridMenu(e: React.MouseEvent | Event, onSortChange: (metricId: string, direction: 'asc' | 'desc') => void) {
	const streams = getAvailableStreams();
	const settings = getSettings();

	const enabledStreams = streams.filter((stream) => settings.enabledStreams[stream.id]);

	const menuContent = (
		<Menu label="Sortium Options">
			{enabledStreams.map((stream) => {
				const enabledMetrics = stream.metrics.filter((metric) => settings.enabledMetrics[metric.id]);

				if (enabledMetrics.length === 0) return null;

				return (
					// @ts-expect-error
					<MenuGroup key={stream.id} label={stream.name}>
						{enabledMetrics.map((metric) => (
							// @ts-expect-error
							<MenuItem key={metric.id} onSelected={() => onSortChange(metric.id, metric.defaultDir)}>
								{metric.name}
							</MenuItem>
						))}
					</MenuGroup>
				);
			})}
		</Menu>
	);

	showContextMenu(menuContent, e.currentTarget || undefined, { bOverlapHorizontal: true, bGrowToElementWidth: true });
}

export function triggerCapsuleMenu(e: React.MouseEvent | Event, appId: number) {
	const availableCollections = ['RPG', 'Multiplayer', 'Backlog'];
	const currentCollections = ['Action', 'Currently Playing'];

	const menuContent = (
		<Menu label="Capsule Options">
			<MenuItem onSelected={() => console.log(`Add ${appId} to favorites`)}>Add to favorites</MenuItem>

			<MenuGroup label="Add to">
				{availableCollections.map((collectionName) => (
					// @ts-expect-error
					<MenuItem key={collectionName} onSelected={() => console.log(`Add ${appId} to ${collectionName}`)}>
						{collectionName}
					</MenuItem>
				))}
			</MenuGroup>

			<MenuGroup label="Remove from">
				{currentCollections.map((collectionName) => (
					// @ts-expect-error
					<MenuItem key={collectionName} onSelected={() => console.log(`Remove ${appId} from ${collectionName}`)}>
						{collectionName}
					</MenuItem>
				))}
			</MenuGroup>
		</Menu>
	);

	showContextMenu(menuContent, e.currentTarget || undefined);
}

interface SortiumContextMenuButtonProps {
	activeMetric: string;
	onSortChange: (metricId: string, direction: 'asc' | 'desc') => void;
}

export function SortiumContextMenuButton({ activeMetric, onSortChange }: SortiumContextMenuButtonProps) {
	const sortModule = findModule((m) => m.SortingDropDown && m.SortingDropDownLabel) || {};
	const label = getMetricLabel(activeMetric);

	return (
		<div
			className={sortModule.SortingDropDown}
			tabIndex={-1}
			onClickCapture={(e) => {
				e.preventDefault();
				e.stopPropagation();
				triggerGridMenu(e, onSortChange);
			}}
		>
			<div className={sortModule.SortingDropDownLabel}>Sort By</div>
			<Dropdown rgOptions={[{ label: label, data: activeMetric }]} selectedOption={activeMetric} onChange={() => {}} />
		</div>
	);
}
