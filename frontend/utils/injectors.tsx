import React from 'react';
import { findModule, findModuleExport } from '@steambrew/client';
import { createRoot } from 'react-dom/client';
import { SortiumDropdown } from '../ui/SortiumDropdown';
import { SortiumDirectionToggle } from '../ui/SortiumDirectionToggle';
import { SortiumStreamStatus } from '../ui/SortiumStreamStatus';
import { SortiumToggle } from '../ui/SortiumToggle';
import { SortiumGrid } from '../ui/SortiumGrid';
import { waitForElement, waitForAllElements } from './dom';
import { filterNativeSortOptions, formatMetricValue, getMetricValue, sortApps } from './sorting';
import { getSettings, saveSettings, subscribeSettings } from '../services/settings';
import { queueService } from '../services/queue';
import { logger } from '../services/logger';

const injectedRoots = new Map<HTMLElement, any>();

let origSortingDropdownRender: Function | null = null;
let origCapsuleType: Function | null = null;
let origArraySort: ((compareFn?: (a: any, b: any) => number) => any[]) | null = null;
let patchedSortingDropdownClass: any = null;
let patchedCapsuleMemo: any = null;
let unsubscribeNativeDropdownSettings: (() => void) | null = null;
let unsubscribeNativeQueueUpdates: (() => void) | null = null;
let nativeQueueThrottleTimer: ReturnType<typeof setTimeout> | null = null;
let activeCollectionAppIds: number[] = [];
const patchedSortingDropdownInstances = new Set<any>();

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
	if (activeMetric && !filteredOptions.some((opt) => opt.data === activeMetric)) {
		activeMetric = '';
		void saveSettings({ ...settings, lastUsedMetric: '' });
	}

	const desiredSelection = activeMetric || dropdownEl.props.selectedOption;
	const isSelectionValid = filteredOptions.some((opt) => opt.data === desiredSelection);
	const resolvedSelection = isSelectionValid ? desiredSelection : filteredOptions[0]?.data;

	const handleSortOptionChange = (option: any, ...args: any[]) => {
		const currentSettings = getSettings();
		if (option && typeof option.data === 'string') {
			void saveSettings({
				...currentSettings,
				lastUsedMetric: option.data,
				sortDirection: option.defaultDir || currentSettings.sortDirection || 'asc',
			});
			// Pass eSortBy = 1 (Alphabetical) to Steam so localStorage never stores custom string IDs.
			if (typeof origOnChange === 'function') {
				origOnChange({ ...option, data: 1 }, ...args);
			}
			return;
		}

		if (currentSettings.lastUsedMetric) {
			void saveSettings({ ...currentSettings, lastUsedMetric: '' });
		}
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
	];

	if (activeMetric) {
		const streamId = activeMetric.split('_')[0] || 'hltb';
		const resolvedCount = activeCollectionAppIds.filter((id) => queueService.hasCacheEntry(streamId, id)).length;

		nextChildren.push(
			<SortiumDirectionToggle direction={settings.sortDirection || 'asc'} />,
			<SortiumStreamStatus
				activeMetric={activeMetric}
				resolvedCount={resolvedCount}
				totalCount={activeCollectionAppIds.length}
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
							settings.sortDirection || 'asc',
						);
						this.splice(0, this.length, ...sorted);
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
					const vdom = origCapsuleType!.call(this, props, ...args);
					const activeMetric = getSettings().lastUsedMetric;

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
 * Unmounts all React roots created by Sortium injectors and restores patched Steam prototypes.
 * Takes no arguments and returns nothing.
 * Cleans up injected UI elements and prototype hooks when tearing down or resetting views.
 */
export function cleanupInjectors() {
	for (const [node, root] of injectedRoots.entries()) {
		try {
			root.unmount();
			node.remove();
		} catch (err) {
			logger.warn('Failed to clean up injected element:', err);
		}
	}
	injectedRoots.clear();

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

		for (const inst of patchedSortingDropdownInstances) {
			try {
				delete inst.render;
			} catch {}
		}
		patchedSortingDropdownInstances.clear();
		activeCollectionAppIds = [];
	} catch (err) {
		logger.warn('Failed to restore native dropdown prototypes cleanly:', err);
	}
}

/**
 * Injects Sortium dropdown menus into showcase section headers on the Steam library home view.
 * Consumes the Steam popup window object and returns a promise resolving once mounted.
 * Mounts interactive React dropdown roots into existing ShowcaseHeader DOM elements.
 */
export async function injectHomeDropdowns(popup: any) {
	const headers = await waitForAllElements(`div.${findModule((e) => e.ShowcaseHeader).ShowcaseHeader}`, popup.m_popup.document);

	if (!headers || headers.length === 0) {
		logger.warn('No ShowcaseHeader elements found. Home dropdowns were not injected.');
		return;
	}

	headers.forEach((headerDiv) => {
		const oldSortiumDropdown = headerDiv.querySelector('div.sortium-dropdown');
		if (!oldSortiumDropdown) {
			const sortiumDropdown = popup.m_popup.document.createElement('div');
			sortiumDropdown.className = 'sortium-dropdown';

			const sortiumRoot = createRoot(sortiumDropdown);
			sortiumRoot.render(<SortiumDropdown />);
			injectedRoots.set(sortiumDropdown, sortiumRoot);

			headerDiv.insertBefore(sortiumDropdown, headerDiv.firstChild!.nextSibling!.nextSibling);
		}
	});
}

/**
 * Injects the Sortium view toggle button into the Steam collection header.
 * Consumes the Steam popup window object and returns a promise resolving once mounted.
 * Removes obsolete toggle elements if present and mounts a new SortiumToggle component into the header.
 */
export async function injectCollectionToggle(popup: any) {
	const headerModule = findModule((m) => m.Header && m.CollectionName && m.DynamicCollectionLabelAndButton);

	if (!headerModule || !headerModule.Header) {
		logger.warn('Could not find the specific Header module for the Collection Toggle.');
		return;
	}

	const headerDiv = await waitForElement(`div.${headerModule.Header}`, popup.m_popup.document);
	if (!headerDiv) {
		logger.warn('Collection header DOM element not found after waiting. Toggle injection aborted.');
		return;
	}

	const oldSortiumToggle = headerDiv.querySelector('div.sortium-toggle');
	if (oldSortiumToggle) {
		oldSortiumToggle.remove();
	}
	const sortiumToggle = popup.m_popup.document.createElement('div');
	sortiumToggle.className = 'sortium-toggle';

	const sortiumRoot = createRoot(sortiumToggle);
	sortiumRoot.render(<SortiumToggle popup={popup} />);
	injectedRoots.set(sortiumToggle, sortiumRoot);

	headerDiv.insertBefore(sortiumToggle, headerDiv.firstChild);
}

/**
 * Injects the custom Sortium grid container adjacent to Steam's native collection grid.
 * Consumes the Steam popup window object and returns a promise resolving once mounted.
 * Inserts a dedicated DOM element rendering SortiumGrid into the collection grid parent container.
 */
export async function injectSortiumGrid(popup: any) {
	const gridModule = findModule((m) => m.GridWithControls);

	if (!gridModule || !gridModule.GridWithControls) {
		logger.warn('Could not find the GridWithControls module for Grid injection.');
		return;
	}

	const oldSortiumGrid = popup.m_popup.document.querySelector('div.sortium-grid');
	if (oldSortiumGrid) {
		oldSortiumGrid.remove();
	}

	const nativeGrid = await waitForElement(`div.${gridModule.GridWithControls}`, popup.m_popup.document);
	if (!nativeGrid || !nativeGrid.parentNode) {
		logger.warn('Native grid or its parent node not found. Grid injection aborted.');
		return;
	}

	const sortiumGridDiv = popup.m_popup.document.createElement('div');
	sortiumGridDiv.className = 'sortium-grid';

	sortiumGridDiv.style.height = '0px';

	const gridRoot = createRoot(sortiumGridDiv);
	gridRoot.render(<SortiumGrid popup={popup} />);
	injectedRoots.set(sortiumGridDiv, gridRoot);

	nativeGrid.parentNode.insertBefore(sortiumGridDiv, nativeGrid);
}
