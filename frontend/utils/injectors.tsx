import React from 'react';
import { Dropdown, findModule, findModuleExport } from '@steambrew/client';
import { createRoot } from 'react-dom/client';
import { SortiumDropdown } from '../ui/SortiumDropdown';
import { SortiumToggle } from '../ui/SortiumToggle';
import { SortiumGrid } from '../ui/SortiumGrid';
import { waitForElement, waitForAllElements } from './dom';
import { filterNativeSortOptions } from './sorting';
import { subscribeSettings } from '../services/settings';
import { logger } from '../services/logger';

const injectedRoots = new Map<HTMLElement, any>();

let origShowMenu: Function | null = null;
let origBuildMenu: Function | null = null;
let origSortingDropdownRender: Function | null = null;
let patchedSortingDropdownClass: any = null;
let unsubscribeNativeDropdownSettings: (() => void) | null = null;
const patchedSortingDropdownInstances = new Set<any>();

function isSortingDropdownInstance(instance: any): boolean {
	const sortCssModule = findModule((m) => m.SortingDropDown && m.SortingDropDownContainer);
	const containerClass = sortCssModule?.SortingDropDownContainer;
	return Boolean(
		containerClass &&
			typeof instance?.props?.strDropDownClassName === 'string' &&
			instance.props.strDropDownClassName.includes(containerClass),
	);
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
	const filteredOptions = filterNativeSortOptions(fullOptions);
	children[1] = React.cloneElement(dropdownEl, {
		rgOptions: filteredOptions,
		_sortiumFullOptions: fullOptions,
	});
	return React.cloneElement(vdom, {}, ...children);
}

/**
 * Hooks Steam's native SortingDropDown and Dropdown prototypes to filter sort options dynamically.
 * Takes no arguments and returns nothing.
 * Patches prototype methods in place and subscribes mounted instances to live settings updates.
 */
export function injectNativeSortingDropdown() {
	try {
		const dropdownProto = (Dropdown as any)?.prototype;

		if (dropdownProto && typeof dropdownProto.ShowMenu === 'function' && !origShowMenu) {
			origShowMenu = dropdownProto.ShowMenu;

			dropdownProto.ShowMenu = function (this: any, ...args: any[]) {
				// Steam caches m_iMenuInstance after the first open; clearing it forces BuildMenu to re-evaluate settings on every click.
				if (isSortingDropdownInstance(this) && this.m_iMenuInstance) {
					try {
						this.m_iMenuInstance.SetOnHideCallback?.(undefined);
					} catch {}
					this.m_iMenuInstance = undefined;
				}
				return origShowMenu!.apply(this, args);
			};
		}

		if (dropdownProto && typeof dropdownProto.BuildMenu === 'function' && !origBuildMenu) {
			origBuildMenu = dropdownProto.BuildMenu;

			dropdownProto.BuildMenu = function (this: any, ...args: any[]) {
				const sourceOptions = this.props?._sortiumFullOptions || this.props?.rgOptions;
				if (isSortingDropdownInstance(this) && Array.isArray(sourceOptions)) {
					const origProps = this.props;
					this.props = {
						...origProps,
						rgOptions: filterNativeSortOptions(sourceOptions),
					};
					try {
						return origBuildMenu!.apply(this, args);
					} finally {
						this.props = origProps;
					}
				}

				return origBuildMenu!.apply(this, args);
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

		if (!unsubscribeNativeDropdownSettings) {
			unsubscribeNativeDropdownSettings = subscribeSettings(() => {
				for (const inst of Array.from(patchedSortingDropdownInstances)) {
					try {
						if (inst?.updater?.isMounted && !inst.updater.isMounted(inst)) {
							patchedSortingDropdownInstances.delete(inst);
							continue;
						}
						inst.forceUpdate?.();
					} catch {
						patchedSortingDropdownInstances.delete(inst);
					}
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
		if (unsubscribeNativeDropdownSettings) {
			unsubscribeNativeDropdownSettings();
			unsubscribeNativeDropdownSettings = null;
		}

		const dropdownProto = (Dropdown as any)?.prototype;
		if (dropdownProto && origShowMenu) {
			dropdownProto.ShowMenu = origShowMenu;
			origShowMenu = null;
		}
		if (dropdownProto && origBuildMenu) {
			dropdownProto.BuildMenu = origBuildMenu;
			origBuildMenu = null;
		}

		if (patchedSortingDropdownClass?.prototype && origSortingDropdownRender) {
			patchedSortingDropdownClass.prototype.render = origSortingDropdownRender;
			origSortingDropdownRender = null;
			patchedSortingDropdownClass = null;
		}

		for (const inst of patchedSortingDropdownInstances) {
			try {
				delete inst.render;
			} catch {}
		}
		patchedSortingDropdownInstances.clear();
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
