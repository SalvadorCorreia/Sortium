import { Menu, MenuItem, MenuGroup, showContextMenu, Dropdown, findModule, MenuSeparator } from '@steambrew/client';
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
	const isFavorite = collectionStore.BIsFavorite(appId);
	const userCollections = collectionStore.userCollections || [];
	const appCollections = collectionStore.GetCollectionListForAppID(appId) || [];

	const appCollectionIds = new Set(appCollections.map((c: any) => c.m_strId));

	const systemIds = ['favorite', 'soundtracks', 'uncategorized', 'hidden'];
	const isValidCollection = (c: any) => {
		if (typeof collectionStore.BIsSystemCollectionId === 'function' && collectionStore.BIsSystemCollectionId(c.m_strId)) {
			return false;
		}
		return !systemIds.includes(c.m_strId);
	};

	const filteredUserCollections = userCollections.filter(isValidCollection);

	const availableCollections = filteredUserCollections.filter((c: any) => !appCollectionIds.has(c.m_strId));
	const currentCollections = filteredUserCollections.filter((c: any) => appCollectionIds.has(c.m_strId));

	const handleFavorite = () => {
		collectionStore.SetAppsAsFavorite([appId], !isFavorite);
	};

	const handleCollectionToggle = (collection: any, isAdding: boolean) => {
		try {
			collectionStore.AddOrRemoveApp([appId], isAdding, collection.m_strId);
		} catch (err) {
			console.error('Sortium: Failed to toggle collection', err);
		}
	};

	const handleProperties = () => {
		SteamClient.Apps.OpenAppSettingsDialog(appId, '');
	};

	const menuContent = (
		<Menu label="Capsule Options">
			<MenuItem onSelected={handleFavorite}>{isFavorite ? 'Remove from favorites' : 'Add to favorites'}</MenuItem>

			{availableCollections.length > 0 && (
				<MenuGroup label="Add to">
					{availableCollections.map((collection: any) => (
						// @ts-expect-error
						<MenuItem key={collection.m_strId} onSelected={() => handleCollectionToggle(collection, true)}>
							{collection.m_strName.toUpperCase()}
						</MenuItem>
					))}
				</MenuGroup>
			)}

			{currentCollections.length > 0 && (
				<MenuGroup label="Remove from">
					{currentCollections.map((collection: any) => (
						// @ts-expect-error
						<MenuItem key={collection.m_strId} onSelected={() => handleCollectionToggle(collection, false)}>
							{collection.m_strName.toUpperCase()}
						</MenuItem>
					))}
				</MenuGroup>
			)}

			<MenuSeparator />
			<MenuItem onSelected={handleProperties}>Properties...</MenuItem>
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
