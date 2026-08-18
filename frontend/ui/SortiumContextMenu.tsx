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
	const contextMenuModule = findModule((m) => m.ContextMenuMouseOverlay) || {};
	const actionModule = findModule((m) => m.LeftListMaxPercentage) || {};

	const appOverview = appStore.GetAppOverviewByAppID(appId);
	const isInstalled = appOverview?.installed;

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

	const handlePrimaryAction = () => {
		if (isInstalled) {
			SteamClient.Apps.RunGame(appId.toString(), '', -1, 0);
		} else {
			SteamClient.Installs.OpenInstallWizard([appId]);
		}
	};

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

	const primaryActionClass = isInstalled ? 'Play' : 'Install';

	const menuContent = (
		<Menu label="Capsule Options">
			{/* @ts-expect-error */}
			<MenuItem className={`${primaryActionClass} ${actionModule.ContextMenuAction} ${contextMenuModule.contextMenuItem}`} onSelected={handlePrimaryAction}>
				{isInstalled ? (
					<svg
						version="1.1"
						id="Layer_1"
						xmlns="http://www.w3.org/2000/svg"
						className="SVGIcon_Button SVGIcon_Play"
						x="0px"
						y="0px"
						width="256px"
						height="256px"
						viewBox="0 0 256 256"
					>
						<path
							className="playTriangle"
							d="M65.321,33.521c-11.274-6.615-20.342-1.471-20.342,11.52V210.96c0,12.989,9.068,18.135,20.342,11.521l137.244-82.348 c11.274-6.618,11.274-17.646,0-24.509L65.321,33.521z"
						></path>
					</svg>
				) : (
					<svg xmlns="http://www.w3.org/2000/svg" className="SVGIcon_Button SVGIcon_Download" viewBox="0 0 36 36" fill="none">
						<path fillRule="evenodd" clipRule="evenodd" d="M29 23V27H7V23H2V32H34V23H29Z" fill="currentColor"></path>
						<svg x="0" y="0" width="32" height="25">
							<path
								className="DownloadArrow"
								d="M20 14.1716L24.5858 9.58578L27.4142 12.4142L18 21.8284L8.58582 12.4142L11.4142 9.58578L16 14.1715V2H20V14.1716Z"
								fill="currentColor"
							></path>
						</svg>
					</svg>
				)}
				{isInstalled ? 'Play' : 'Install'}
			</MenuItem>

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

	showContextMenu(menuContent, e as any);
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
