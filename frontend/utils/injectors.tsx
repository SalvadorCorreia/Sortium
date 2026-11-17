import React from 'react';
import { afterPatch, findModule, findModuleExport, replacePatch, type Patch } from '@steambrew/client';
import { SortiumDirectionToggle } from '../ui/SortiumDirectionToggle';
import { SortiumStreamStatus } from '../ui/SortiumStreamStatus';
import { filterNativeSortOptions, formatMetricValue, getMetricValue, sortApps } from './sorting';
import { getAvailableStreams, getSettings, saveSettings, subscribeSettings } from '../services/settings';
import { queueService } from '../services/queue';
import { logger } from '../services/logger';

let cachedSortingDropdownClass: any = null;
let cachedCapsuleMemo: any = null;
let cachedSubscriptClass: string | undefined;
let cachedIconButtonClass: string | undefined;

const activePatches: Patch[] = [];
const patchedSortingDropdownInstances = new Set<any>();
let unsubscribeNativeDropdownSettings: (() => void) | null = null;
let unsubscribeNativeQueueUpdates: (() => void) | null = null;
let nativeQueueThrottleTimer: ReturnType<typeof setTimeout> | null = null;

function hasAnyActiveCustomMetric(): boolean {
	const settings = getSettings();
	if (settings.lastUsedMetric) return true;
	return Object.values(settings.showcaseSortStates || {}).some((state) => Boolean(state?.metric));
}

function resolveSteamModules(): void {
	if (!cachedSortingDropdownClass) {
		cachedSortingDropdownClass = findModuleExport(
			(e: any) => typeof e === 'function' && e.prototype?.OnChange && e.toString().includes('onSortChangeCallback'),
		);
	}
	if (!cachedCapsuleMemo) {
		const capsuleModule = findModule((m) =>
			Object.values(m).some((v: any) => typeof v === 'function' && v.prototype?.BHasVerticalCapsule),
		);
		cachedCapsuleMemo =
			capsuleModule &&
			(Object.values(capsuleModule).find(
				(v: any) => typeof v === 'object' && v !== null && typeof v.type === 'function',
			) as any);
	}
	if (!cachedSubscriptClass) {
		cachedSubscriptClass = findModule((m) => m.LibraryItemBoxSubscript && m.LibraryItemBox)?.LibraryItemBoxSubscript;
	}
	if (!cachedIconButtonClass) {
		cachedIconButtonClass = findModule((m) => m.IconButton)?.IconButton;
	}
}

function forceUpdateNativeCollectionViews(): void {
	for (const inst of Array.from(patchedSortingDropdownInstances)) {
		try {
			if (inst?.updater?.isMounted && !inst.updater.isMounted(inst)) {
				patchedSortingDropdownInstances.delete(inst);
				continue;
			}

			// Walk up the React Fiber tree to re-render the parent collection or showcase controller
			// because React's useState(1) / SetSortBy(1) bails out when eSortBy is already 1.
			let curr = inst._reactInternals?.return || inst._reactInternalFiber?.return;
			let passedGridController = false;
			let updatedParentController = false;
			for (let depth = 0; curr && depth < 30; depth++, curr = curr.return) {
				if (Array.isArray(curr.memoizedProps?.appOverviews) || Boolean(curr.memoizedProps?.showcase)) {
					passedGridController = true;
				}
				if (passedGridController && typeof curr.stateNode?.forceUpdate === 'function') {
					curr.stateNode.forceUpdate();
					updatedParentController = true;
				}
			}

			if (!updatedParentController) {
				inst.forceUpdate?.();
			}
		} catch {
			patchedSortingDropdownInstances.delete(inst);
		}
	}
}

type SortingTarget =
	| { type: 'collection'; zeFiber: any }
	| { type: 'showcase'; showcaseKey: string; showcase: any; childElements: any[] | null };

function extractShowcaseChildElements(siblingFiber: any): any[] | null {
	const rawProps = siblingFiber?.pendingProps;
	const children = Array.isArray(rawProps) ? rawProps : rawProps?.children;
	if (!Array.isArray(children)) return null;
	for (const el of children) {
		if (Array.isArray(el?.props?.childElements)) {
			return el.props.childElements;
		}
	}
	return null;
}

function findSortingTarget(dropdownInstance: any): SortingTarget | null {
	let curr = dropdownInstance?._reactInternals?.return || dropdownInstance?._reactInternalFiber?.return;
	let fallbackGridFiber: any = null;
	let fallbackShowcaseTarget: SortingTarget | null = null;

	for (let depth = 0; curr && depth < 10; depth++, curr = curr.return) {
		// Check both current and workInProgress (alternate) fiber trees for the unprocessed childSections array created in this render pass.
		const sectionsA = curr.sibling?.pendingProps?.childSections;
		const sectionsB = curr.alternate?.sibling?.pendingProps?.childSections;
		if (Array.isArray(sectionsA)) {
			if (!(sectionsA as any)._sortiumProcessed) return { type: 'collection', zeFiber: curr.sibling };
			fallbackGridFiber = fallbackGridFiber || curr.sibling;
		}
		if (Array.isArray(sectionsB)) {
			if (!(sectionsB as any)._sortiumProcessed) return { type: 'collection', zeFiber: curr.alternate.sibling };
			fallbackGridFiber = fallbackGridFiber || curr.alternate.sibling;
		}

		// Check for Library Home Showcase header (W0) paired with a showcase grid sibling (childElements).
		const showcase = curr.pendingProps?.showcase || curr.memoizedProps?.showcase;
		if (showcase) {
			// Ensure W0 (SimpleMemoComponent) never bails out when parent Showcase (sc) re-renders with a new childElements array.
			if (curr.pendingProps && typeof curr.pendingProps === 'object') {
				curr.pendingProps._sortiumBustMemo = true;
			}
			const showcaseKey = String(showcase.nShowcaseId ?? showcase.strCollectionId ?? 'default');
			const elementsA = extractShowcaseChildElements(curr.sibling);
			const elementsB = extractShowcaseChildElements(curr.alternate?.sibling);
			if (elementsA && !(elementsA as any)._sortiumProcessed) {
				return { type: 'showcase', showcaseKey, showcase, childElements: elementsA };
			}
			if (elementsB && !(elementsB as any)._sortiumProcessed) {
				return { type: 'showcase', showcaseKey, showcase, childElements: elementsB };
			}
			fallbackShowcaseTarget = fallbackShowcaseTarget || {
				type: 'showcase',
				showcaseKey,
				showcase,
				childElements: elementsA || elementsB,
			};
		}
	}

	if (fallbackGridFiber) return { type: 'collection', zeFiber: fallbackGridFiber };
	return fallbackShowcaseTarget;
}

function syncShowcaseGridElements(
	showcase: any,
	childElements: any[] | null,
	activeMetric: string,
	sortDirection: 'asc' | 'desc',
): number[] {
	if (!Array.isArray(childElements) || childElements.length === 0) {
		return [];
	}

	const headerElements: any[] = [];
	const appWrappers: { appid: number; sort_as?: string; el: any; innerProps: any }[] = [];

	for (const el of childElements) {
		const innerProps = el?.props?.children?.props?.children?.props;
		const app = innerProps?.app;
		if (typeof app?.appid === 'number') {
			innerProps._sortiumMetric = activeMetric;
			appWrappers.push({ appid: app.appid, sort_as: app.sort_as, el, innerProps });
		} else {
			headerElements.push(el);
		}
	}

	const appIds = appWrappers.map((w) => w.appid);
	if (appWrappers.length === 0 || (childElements as any)._sortiumProcessed) {
		return appIds;
	}
	Object.defineProperty(childElements, '_sortiumProcessed', { value: true, enumerable: false });

	const visibleAppCount = appWrappers.filter((w) => !w.innerProps.bHidePortrait).length;

	let orderedWrappers = appWrappers;
	if (activeMetric) {
		const streamId = activeMetric.split('_')[0] || 'hltb';
		setTimeout(() => queueService.enqueue(appIds, streamId), 0);

		orderedWrappers = sortApps(
			appWrappers,
			activeMetric,
			(appId) => queueService.getCachedData(streamId, appId),
			sortDirection,
		);
	} else {
		const eSortBy = showcase?.eSortBy ?? 1;
		const nativeDefaultDir = eSortBy === 1 ? 'asc' : 'desc';
		if (sortDirection !== nativeDefaultDir) {
			orderedWrappers = [...appWrappers].reverse();
		}
	}

	orderedWrappers.forEach((w, idx) => {
		w.innerProps.bHidePortrait = idx >= visibleAppCount;
	});

	childElements.splice(0, childElements.length, ...headerElements, ...orderedWrappers.map((w) => w.el));
	return appIds;
}

function syncCollectionGridSections(
	zeFiber: any,
	activeMetric: string,
	sortDirection: 'asc' | 'desc',
): number[] {
	const rawOverviews = zeFiber?.pendingProps?.appOverviews;
	const appIds: number[] = Array.isArray(rawOverviews) ? rawOverviews.map((app: any) => app.appid) : [];

	const sections: any[] | undefined = zeFiber?.pendingProps?.childSections;
	if (!Array.isArray(sections) || sections.length === 0 || (sections as any)._sortiumProcessed) {
		return appIds;
	}
	Object.defineProperty(sections, '_sortiumProcessed', { value: true, enumerable: false });

	if (activeMetric) {
		const streamId = activeMetric.split('_')[0] || 'hltb';
		if (appIds.length > 0) {
			// Defer queue enqueue out of React's render phase to prevent synchronous listener re-entrancy.
			setTimeout(() => queueService.enqueue(appIds, streamId), 0);
		}

		const allItems = sections.flatMap((sec: any) => sec?.children || []);
		if (allItems.length === 0) return appIds;

		const sortedItems = sortApps(
			allItems,
			activeMetric,
			(appId) => queueService.getCachedData(streamId, appId),
			sortDirection,
		);

		const template = sections[0];
		const nextSections: any[] = [];
		let currentSectionName: string | undefined;

		for (const item of sortedItems) {
			const appId = item?.m_overview?.appid;
			const value = getMetricValue(activeMetric, queueService.getCachedData(streamId, appId));
			const sectionName = formatMetricValue(
				value,
				activeMetric,
				queueService.getEntryState(streamId, appId),
				'section',
			);

			if (sectionName !== currentSectionName || nextSections.length === 0) {
				nextSections.push({
					...template,
					subSectionName: sectionName,
					children: [],
					hideHeaderIfEmpty: false,
					sectionIndex: nextSections.length,
					refSection: React.createRef(),
					refItemsPerRow: React.createRef(),
				});
				currentSectionName = sectionName;
			}
			nextSections[nextSections.length - 1].children.push(item);
		}

		sections.splice(0, sections.length, ...nextSections);
		return appIds;
	}

	const eSortBy = zeFiber?.pendingProps?.eSortBy ?? 1;
	const nativeDefaultDir = eSortBy === 1 ? 'asc' : 'desc';
	if (sortDirection !== nativeDefaultDir) {
		sections.reverse();
		sections.forEach((sec: any, idx: number) => {
			sec?.children?.reverse?.();
			if (sec) sec.sectionIndex = idx;
		});
	}
	return appIds;
}

function transformSortingDropdownVdom(instance: any, vdom: any): any {
	const dropdownEl = vdom?.props?.children?.[1];
	const target = findSortingTarget(instance);
	// Restrict dropdown injection to library collection grids and home showcases so Settings -> Storage stays untouched.
	if (!target || !Array.isArray(dropdownEl?.props?.rgOptions)) {
		patchedSortingDropdownInstances.delete(instance);
		return vdom;
	}

	// Preserve original unfiltered options on a custom prop so re-enabled metrics can be restored without remounting.
	const fullOptions = dropdownEl.props._sortiumFullOptions || dropdownEl.props.rgOptions;
	const origOnChange = dropdownEl.props._sortiumOrigOnChange || dropdownEl.props.onChange;
	const filteredOptions = filterNativeSortOptions(fullOptions);

	const settings = getSettings();
	const isShowcase = target.type === 'showcase';
	const showcaseState = isShowcase ? settings.showcaseSortStates?.[target.showcaseKey] : undefined;

	let activeMetric = isShowcase ? showcaseState?.metric || '' : settings.lastUsedMetric;
	if (activeMetric && getAvailableStreams().length > 0 && !filteredOptions.some((opt) => opt.data === activeMetric)) {
		activeMetric = '';
		setTimeout(() => {
			const current = getSettings();
			if (isShowcase) {
				const prev = current.showcaseSortStates?.[target.showcaseKey];
				if (!prev) return;
				void saveSettings({
					...current,
					showcaseSortStates: {
						...(current.showcaseSortStates || {}),
						[target.showcaseKey]: { ...prev, metric: '' },
					},
				});
			} else {
				void saveSettings({ ...current, lastUsedMetric: '' });
			}
		}, 0);
	}

	const desiredSelection = activeMetric || dropdownEl.props.selectedOption;
	const resolvedSelection = filteredOptions.some((opt) => opt.data === desiredSelection)
		? desiredSelection
		: filteredOptions[0]?.data;

	const defaultDirection = resolvedSelection === 1 ? 'asc' : 'desc';
	const activeSortDirection = isShowcase
		? showcaseState?.sortDirection || defaultDirection
		: settings.sortDirection || defaultDirection;

	if (activeMetric && dropdownEl.props.selectedOption !== 1 && typeof origOnChange === 'function') {
		setTimeout(() => origOnChange({ data: 1 }), 0);
	}

	const collectionAppIds =
		target.type === 'collection'
			? syncCollectionGridSections(target.zeFiber, activeMetric, activeSortDirection)
			: syncShowcaseGridElements(target.showcase, target.childElements, activeMetric, activeSortDirection);

	dropdownEl.props._sortiumFullOptions = fullOptions;
	dropdownEl.props._sortiumOrigOnChange = origOnChange;
	dropdownEl.props.rgOptions = filteredOptions;
	dropdownEl.props.selectedOption = resolvedSelection;
	dropdownEl.props.onChange = (option: any, ...args: any[]) => {
		const isCustom = typeof option?.data === 'string';
		const nextMetric = isCustom ? option.data : '';
		const nextDirection = option?.defaultDir || (option?.data === 1 ? 'asc' : 'desc');
		const current = getSettings();

		if (isShowcase) {
			void saveSettings({
				...current,
				showcaseSortStates: {
					...(current.showcaseSortStates || {}),
					[target.showcaseKey]: {
						metric: nextMetric,
						sortDirection: nextDirection,
					},
				},
			});
		} else {
			void saveSettings({
				...current,
				lastUsedMetric: nextMetric,
				sortDirection: nextDirection,
			});
		}

		if (typeof origOnChange === 'function') {
			origOnChange(isCustom ? { ...option, data: 1 } : option, ...args);
		}
	};

	vdom.props.children.splice(
		2,
		vdom.props.children.length - 2,
		<SortiumDirectionToggle
			direction={activeSortDirection}
			className={cachedIconButtonClass}
			onToggle={() => {
				const current = getSettings();
				const nextDirection = activeSortDirection === 'asc' ? 'desc' : 'asc';
				if (isShowcase) {
					void saveSettings({
						...current,
						showcaseSortStates: {
							...(current.showcaseSortStates || {}),
							[target.showcaseKey]: {
								metric: activeMetric,
								sortDirection: nextDirection,
							},
						},
					});
				} else {
					void saveSettings({
						...current,
						sortDirection: nextDirection,
					});
				}
			}}
		/>,
	);

	if (activeMetric) {
		const streamId = activeMetric.split('_')[0] || 'hltb';
		const resolvedCount = collectionAppIds.filter((id) => queueService.hasCacheEntry(streamId, id)).length;

		vdom.props.children.push(
			<SortiumStreamStatus
				resolvedCount={resolvedCount}
				totalCount={collectionAppIds.length}
				isRateLimited={queueService.getStreamState(streamId) === 'RATE_LIMITED'}
				retryAfterSeconds={queueService.getRateLimitRemaining(streamId)}
				className={cachedIconButtonClass}
			/>,
		);
	}

	return vdom;
}

/**
 * Hooks Steam's native SortingDropDown and capsule components using @steambrew/client patchers to support Sortium metrics.
 * Takes no arguments and returns nothing.
 * Patches component methods in place and subscribes mounted collection views to settings and queue updates.
 */
export function injectNativeSortingDropdown() {
	if (activePatches.length > 0) return;

	try {
		resolveSteamModules();

		if (cachedSortingDropdownClass?.prototype) {
			// Ensure SortingDropDown re-renders whenever Fe re-renders (e.g. when switching collections while eSortBy stays 1).
			activePatches.push(
				replacePatch(cachedSortingDropdownClass.prototype, 'shouldComponentUpdate', () => true),
			);

			const renderPatch: Patch = replacePatch(
				cachedSortingDropdownClass.prototype,
				'render',
				function (this: any, args: any[]): any {
					patchedSortingDropdownInstances.add(this);
					if (!this._sortiumMobxRender) {
						const self = this;
						const origDefineProperty = Object.defineProperty;
						// MobX @observer lazily defines instance.render as non-configurable on first render; store it on _sortiumMobxRender so prototype patch stays active.
						Object.defineProperty = function (target: any, prop: PropertyKey, attributes: PropertyDescriptor) {
							if (target === self && prop === 'render' && typeof attributes.value === 'function') {
								self._sortiumMobxRender = attributes.value;
								return target;
							}
							return origDefineProperty.call(Object, target, prop, attributes);
						} as typeof Object.defineProperty;

						try {
							return renderPatch.original.apply(this, args);
						} finally {
							Object.defineProperty = origDefineProperty;
						}
					}

					return transformSortingDropdownVdom(this, this._sortiumMobxRender.apply(this, args));
				},
			);
			activePatches.push(renderPatch);
		}

		if (cachedCapsuleMemo?.type && cachedSubscriptClass) {
			activePatches.push(
				afterPatch(cachedCapsuleMemo, 'type', ([props]: [any], vdom: any) => {
					const activeMetric =
						typeof props?._sortiumMetric === 'string'
							? props._sortiumMetric
							: props?.bShowFriendsAsIcons
								? ''
								: getSettings().lastUsedMetric;
					// Context 1 (InCollection) restricts subscript badges to collection grid and showcase capsules.
					if (
						!activeMetric ||
						props?.context !== 1 ||
						typeof props?.app?.appid !== 'number' ||
						!Array.isArray(vdom?.props?.children)
					) {
						return vdom;
					}

					const streamId = activeMetric.split('_')[0] || 'hltb';
					const appId = props.app.appid;
					const value = getMetricValue(activeMetric, queueService.getCachedData(streamId, appId));
					const metricText = formatMetricValue(value, activeMetric, queueService.getEntryState(streamId, appId));

					vdom.props.children.splice(1, 0, <div className={cachedSubscriptClass}>{metricText}</div>);
					return vdom;
				}),
			);
		}

		if (!unsubscribeNativeDropdownSettings) {
			unsubscribeNativeDropdownSettings = subscribeSettings(forceUpdateNativeCollectionViews);
		}

		if (!unsubscribeNativeQueueUpdates) {
			unsubscribeNativeQueueUpdates = queueService.subscribe(() => {
				if (!hasAnyActiveCustomMetric() || nativeQueueThrottleTimer) return;
				nativeQueueThrottleTimer = setTimeout(() => {
					nativeQueueThrottleTimer = null;
					if (hasAnyActiveCustomMetric()) {
						forceUpdateNativeCollectionViews();
					}
				}, 1000);
			});
		}
	} catch (err) {
		logger.error('Failed to inject native sorting dropdown hook:', err);
	}
}

/**
 * Restores patched Steam prototypes, memo components, and subscriptions registered by Sortium injectors.
 * Takes no arguments and returns nothing.
 * Cleans up active @steambrew/client patches and listeners when tearing down or resetting views.
 */
export function cleanupInjectors() {
	try {
		if (nativeQueueThrottleTimer) {
			clearTimeout(nativeQueueThrottleTimer);
			nativeQueueThrottleTimer = null;
		}
		unsubscribeNativeQueueUpdates?.();
		unsubscribeNativeQueueUpdates = null;
		unsubscribeNativeDropdownSettings?.();
		unsubscribeNativeDropdownSettings = null;

		activePatches.splice(0).forEach((patch) => patch.unpatch());

		for (const inst of patchedSortingDropdownInstances) {
			try {
				delete inst.render;
				delete inst._sortiumMobxRender;
			} catch {}
		}
		patchedSortingDropdownInstances.clear();
	} catch (err) {
		logger.warn('Failed to restore native dropdown patches cleanly:', err);
	}
}
