import React from 'react';
import { findModule, findModuleExport } from '@steambrew/client';
import { SortiumDirectionToggle } from '../ui/SortiumDirectionToggle';
import { SortiumStreamStatus } from '../ui/SortiumStreamStatus';
import { filterNativeSortOptions, formatMetricValue, getMetricValue, sortApps } from './sorting';
import { getAvailableStreams, getSettings, saveSettings, subscribeSettings } from '../services/settings';
import { queueService } from '../services/queue';
import { logger } from '../services/logger';

let origSortingDropdownRender: Function | null = null;
let origCapsuleType: Function | null = null;
let origGetLastPlayedSectionName: Function | null = null;
let origArraySort: ((compareFn?: (a: any, b: any) => number) => any[]) | null = null;
let patchedSortingDropdownClass: any = null;
let patchedCapsuleMemo: any = null;
let patchedAppOverviewProto: any = null;
let unsubscribeNativeDropdownSettings: (() => void) | null = null;
let unsubscribeNativeQueueUpdates: (() => void) | null = null;
let nativeQueueThrottleTimer: ReturnType<typeof setTimeout> | null = null;
let activeCollectionAppIds: number[] = [];
let activeNativeSort: number | null = null;
const patchedSortingDropdownInstances = new Set<any>();

function getActiveNativeSort(): number {
	if (activeNativeSort !== null) return activeNativeSort;
	try {
		const raw = window.localStorage.getItem('AppGridDisplaySettings');
		if (raw) {
			const parsed = JSON.parse(raw);
			if (typeof parsed?.eSortBy === 'number') return parsed.eSortBy;
		}
	} catch {}
	return 1;
}

function forceUpdateNativeCollectionViews(): void {
	for (const inst of Array.from(patchedSortingDropdownInstances)) {
		try {
			if (inst?.updater?.isMounted && !inst.updater.isMounted(inst)) {
				patchedSortingDropdownInstances.delete(inst);
				continue;
			}
			inst.forceUpdate?.();

			// Walk up the React Fiber tree to re-render the parent collection view controller (xt -> Fe -> mt)
			// because React's useState(1) in Re() bails out when eSortBy is already 1.
			let curr = inst._reactInternals?.return || inst._reactInternalFiber?.return;
			let passedGridController = false;
			let depth = 0;
			while (curr && depth < 30) {
				if (curr.memoizedProps && Array.isArray(curr.memoizedProps.appOverviews)) {
					passedGridController = true;
					activeCollectionAppIds = curr.memoizedProps.appOverviews.map((item: any) => item.appid);
				}
				if (passedGridController && curr.stateNode && typeof curr.stateNode.forceUpdate === 'function') {
					curr.stateNode.forceUpdate();
				}
				curr = curr.return;
				depth++;
			}
		} catch {
			patchedSortingDropdownInstances.delete(inst);
		}
	}
}

function transformSortingDropdownVdom(vdom: any): any {
	if (!vdom || !vdom.props || !Array.isArray(vdom.props.children)) {
		return vdom;
	}

	const children = [...vdom.props.children];
	const dropdownEl = children[1];
	if (!dropdownEl || !dropdownEl.props || !Array.isArray(dropdownEl.props.rgOptions)) {
		return vdom;
	}

	// Preserve original unfiltered options on a custom prop so re-enabled metrics can be restored without remounting.
	const fullOptions = dropdownEl.props._sortiumFullOptions || dropdownEl.props.rgOptions;
	const origOnChange = dropdownEl.props._sortiumOrigOnChange || dropdownEl.props.onChange;
	const filteredOptions = filterNativeSortOptions(fullOptions);

	const settings = getSettings();
	let activeMetric = settings.lastUsedMetric;
	if (activeMetric && getAvailableStreams().length > 0 && !filteredOptions.some((opt) => opt.data === activeMetric)) {
		activeMetric = '';
		setTimeout(() => {
			void saveSettings({ ...getSettings(), lastUsedMetric: '' });
		}, 0);
	}

	const desiredSelection = activeMetric || dropdownEl.props.selectedOption;
	const isSelectionValid = filteredOptions.some((opt) => opt.data === desiredSelection);
	const resolvedSelection = isSelectionValid ? desiredSelection : filteredOptions[0]?.data;

	if (!activeMetric && typeof resolvedSelection === 'number') {
		activeNativeSort = resolvedSelection;
	} else if (activeMetric && dropdownEl.props.selectedOption !== 5 && typeof origOnChange === 'function') {
		setTimeout(() => origOnChange({ data: 5 }), 0);
	}

	const handleSortOptionChange = (option: any, ...args: any[]) => {
		const currentSettings = getSettings();
		if (option && typeof option.data === 'string') {
			void saveSettings({
				...currentSettings,
				lastUsedMetric: option.data,
				sortDirection: option.defaultDir || 'desc',
			});
			// Pass eSortBy = 5 (Last Played) so Steam's ComputeChildSectionName delegates section headers to GetLastPlayedSectionName().
			if (typeof origOnChange === 'function') {
				origOnChange({ ...option, data: 5 }, ...args);
			}
			return;
		}

		if (typeof option?.data === 'number') {
			activeNativeSort = option.data;
		}
		void saveSettings({
			...currentSettings,
			lastUsedMetric: '',
			sortDirection: option?.defaultDir || (option?.data === 1 ? 'asc' : 'desc'),
		});
		if (typeof origOnChange === 'function') {
			origOnChange(option, ...args);
		}
	};

	const nextChildren: any[] = [
		children[0],
		React.cloneElement(dropdownEl, {
			rgOptions: filteredOptions,
			selectedOption: resolvedSelection,
			onChange: handleSortOptionChange,
			_sortiumFullOptions: fullOptions,
			_sortiumOrigOnChange: origOnChange,
		}),
		<SortiumDirectionToggle
			direction={settings.sortDirection || 'asc'}
			onToggle={() => {
				const current = getSettings();
				void saveSettings({
					...current,
					sortDirection: (current.sortDirection || 'asc') === 'asc' ? 'desc' : 'asc',
				});
			}}
		/>,
	];

	if (activeMetric) {
		const streamId = activeMetric.split('_')[0] || 'hltb';
		const resolvedCount = activeCollectionAppIds.filter((id) => queueService.hasCacheEntry(streamId, id)).length;

		nextChildren.push(
			<SortiumStreamStatus
				resolvedCount={resolvedCount}
				totalCount={activeCollectionAppIds.length}
				isRateLimited={queueService.getStreamState(streamId) === 'RATE_LIMITED'}
				retryAfterSeconds={queueService.getRateLimitRemaining(streamId)}
			/>,
		);
	}

	return React.cloneElement(vdom, {}, ...nextChildren);
}

/**
 * Hooks Steam's native SortingDropDown, Dropdown, capsule component, and collection sort pipeline to support Sortium metrics.
 * Takes no arguments and returns nothing.
 * Patches prototype and memo methods in place and subscribes mounted collection views to settings and queue updates.
 */
export function injectNativeSortingDropdown() {
	try {
		if (!origArraySort) {
			origArraySort = Array.prototype.sort;

			Array.prototype.sort = function (this: any[], compareFn?: (a: any, b: any) => number): any[] {
				if (
					typeof compareFn === 'function' &&
					(this.length === 0 || typeof this[0]?.appid === 'number') &&
					compareFn.toString().includes('CompareSortAs')
				) {
					activeCollectionAppIds = this.map((item) => item.appid);
					if (this.length > 0 && !origGetLastPlayedSectionName) {
						const appProto = Object.getPrototypeOf(this[0]);
						if (typeof appProto?.GetLastPlayedSectionName === 'function') {
							patchedAppOverviewProto = appProto;
							origGetLastPlayedSectionName = appProto.GetLastPlayedSectionName;
							appProto.GetLastPlayedSectionName = function (this: any) {
								const activeMetric = getSettings().lastUsedMetric;
								if (!activeMetric) {
									return origGetLastPlayedSectionName!.call(this);
								}
								const streamId = activeMetric.split('_')[0] || 'hltb';
								const value = getMetricValue(activeMetric, queueService.getCachedData(streamId, this.appid));
								return formatMetricValue(
									value,
									activeMetric,
									queueService.getEntryState(streamId, this.appid),
									'section',
								);
							};
						}
					}
					origArraySort!.call(this, compareFn);

					const settings = getSettings();
					const activeMetric = settings.lastUsedMetric;
					if (activeMetric) {
						const streamId = activeMetric.split('_')[0] || 'hltb';
						if (activeCollectionAppIds.length > 0) {
							// Defer queue enqueue out of React's render phase to prevent synchronous listener re-entrancy.
							const idsToQueue = activeCollectionAppIds;
							setTimeout(() => {
								queueService.enqueue(idsToQueue, streamId);
							}, 0);
						}

						const sorted = sortApps(
							this,
							activeMetric,
							(appId) => queueService.getCachedData(streamId, appId),
							settings.sortDirection || 'desc',
						);
						this.splice(0, this.length, ...sorted);
					} else {
						const nativeDefaultDir = getActiveNativeSort() === 1 ? 'asc' : 'desc';
						if ((settings.sortDirection || nativeDefaultDir) !== nativeDefaultDir) {
							this.reverse();
						}
					}

					return this;
				}

				return origArraySort!.apply(this, arguments as any);
			};
		}

		const SortingDropDownClass = findModuleExport(
			(e: any) => typeof e === 'function' && e.prototype?.OnChange && e.toString().includes('onSortChangeCallback'),
		);

		if (SortingDropDownClass?.prototype?.render && !origSortingDropdownRender) {
			patchedSortingDropdownClass = SortingDropDownClass;
			origSortingDropdownRender = SortingDropDownClass.prototype.render;

			SortingDropDownClass.prototype.render = function (this: any, ...args: any[]) {
				const self = this;
				patchedSortingDropdownInstances.add(self);
				const origDefineProperty = Object.defineProperty;

				// MobX @observer lazily locks instance.render as a non-writable own property on first render; intercept it so subsequent reactive renders stay wrapped.
				Object.defineProperty = function (target: any, prop: PropertyKey, attributes: PropertyDescriptor) {
					if (target === self && prop === 'render' && typeof attributes.value === 'function') {
						const mobxRender = attributes.value;
						patchedSortingDropdownInstances.add(self);
						attributes = {
							...attributes,
							configurable: true,
							writable: true,
							value: function (this: any, ...renderArgs: any[]) {
								const vdom = mobxRender.apply(this, renderArgs);
								return transformSortingDropdownVdom(vdom);
							},
						};
					}
					return origDefineProperty.call(Object, target, prop, attributes);
				} as typeof Object.defineProperty;

				try {
					const vdom = origSortingDropdownRender!.apply(this, args);
					return transformSortingDropdownVdom(vdom);
				} finally {
					Object.defineProperty = origDefineProperty;
				}
			};
		}

		if (!origCapsuleType) {
			const capsuleModule = findModule((m) =>
				Object.values(m).some((v: any) => typeof v === 'function' && v.prototype?.BHasVerticalCapsule),
			);
			const capsuleMemo =
				capsuleModule &&
				(Object.values(capsuleModule).find(
					(v: any) => typeof v === 'object' && v !== null && typeof v.type === 'function',
				) as any);
			const subscriptClass = findModule((m) => m.LibraryItemBoxSubscript && m.LibraryItemBox)?.LibraryItemBoxSubscript;

			if (capsuleMemo?.type && subscriptClass) {
				patchedCapsuleMemo = capsuleMemo;
				origCapsuleType = capsuleMemo.type;

				capsuleMemo.type = function (this: any, props: any, ...args: any[]) {
					const activeMetric = getSettings().lastUsedMetric;
					// Pass sortByType = 1 when a Sortium metric is active so Steam suppresses its native Last Played subscript.
					const effectiveProps = activeMetric && props?.context === 1 ? { ...props, sortByType: 1 } : props;
					const vdom = origCapsuleType!.call(this, effectiveProps, ...args);

					// Context 1 (InCollection) restricts subscript badges to collection grid capsules.
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

					return React.cloneElement(
						vdom,
						{},
						vdom.props.children[0],
						<div className={subscriptClass}>{metricText}</div>,
						...vdom.props.children.slice(1),
					);
				};
			}
		}

		if (!unsubscribeNativeDropdownSettings) {
			unsubscribeNativeDropdownSettings = subscribeSettings(() => {
				forceUpdateNativeCollectionViews();
			});
		}

		if (!unsubscribeNativeQueueUpdates) {
			unsubscribeNativeQueueUpdates = queueService.subscribe(() => {
				if (!getSettings().lastUsedMetric) return;
				if (!nativeQueueThrottleTimer) {
					nativeQueueThrottleTimer = setTimeout(() => {
						nativeQueueThrottleTimer = null;
						if (getSettings().lastUsedMetric) {
							forceUpdateNativeCollectionViews();
						}
					}, 1000);
				}
			});
		}
	} catch (err) {
		logger.error('Failed to inject native sorting dropdown hook:', err);
	}
}

/**
 * Restores patched Steam prototypes, memo components, and subscriptions registered by Sortium injectors.
 * Takes no arguments and returns nothing.
 * Cleans up prototype hooks and listeners when tearing down or resetting views.
 */
export function cleanupInjectors() {
	try {
		if (nativeQueueThrottleTimer) {
			clearTimeout(nativeQueueThrottleTimer);
			nativeQueueThrottleTimer = null;
		}
		if (unsubscribeNativeQueueUpdates) {
			unsubscribeNativeQueueUpdates();
			unsubscribeNativeQueueUpdates = null;
		}
		if (unsubscribeNativeDropdownSettings) {
			unsubscribeNativeDropdownSettings();
			unsubscribeNativeDropdownSettings = null;
		}

		if (origArraySort) {
			Array.prototype.sort = origArraySort;
			origArraySort = null;
		}

		if (patchedSortingDropdownClass?.prototype && origSortingDropdownRender) {
			patchedSortingDropdownClass.prototype.render = origSortingDropdownRender;
			origSortingDropdownRender = null;
			patchedSortingDropdownClass = null;
		}

		if (patchedCapsuleMemo && origCapsuleType) {
			patchedCapsuleMemo.type = origCapsuleType;
			origCapsuleType = null;
			patchedCapsuleMemo = null;
		}

		if (patchedAppOverviewProto && origGetLastPlayedSectionName) {
			patchedAppOverviewProto.GetLastPlayedSectionName = origGetLastPlayedSectionName;
			origGetLastPlayedSectionName = null;
			patchedAppOverviewProto = null;
		}

		for (const inst of patchedSortingDropdownInstances) {
			try {
				delete inst.render;
			} catch {}
		}
		patchedSortingDropdownInstances.clear();
		activeCollectionAppIds = [];
		activeNativeSort = null;
	} catch (err) {
		logger.warn('Failed to restore native dropdown prototypes cleanly:', err);
	}
}
