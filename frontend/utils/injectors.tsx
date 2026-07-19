import { findModule } from '@steambrew/client';
import { createRoot } from 'react-dom/client';
import { SortiumDropdown } from '../ui/SortiumDropdown';
import { SortiumToggle } from '../ui/SortiumToggle';
import { SortiumGrid } from '../ui/SortiumGrid';
import { waitForElement, waitForAllElements } from './dom';

export async function injectHomeDropdowns(popup: any) {
	const headers = await waitForAllElements(`div.${findModule((e) => e.ShowcaseHeader).ShowcaseHeader}`, popup.m_popup.document);
	headers.forEach((headerDiv) => {
		const oldSortiumDropdown = headerDiv.querySelector('div.sortium-dropdown');
		if (!oldSortiumDropdown) {
			const sortiumDropdown = popup.m_popup.document.createElement('div');
			sortiumDropdown.className = 'sortium-dropdown';

			const sortiumRoot = createRoot(sortiumDropdown);
			sortiumRoot.render(<SortiumDropdown popup={popup} />);

			headerDiv.insertBefore(sortiumDropdown, headerDiv.firstChild!.nextSibling!.nextSibling);
		}
	});
}

export async function injectCollectionToggle(popup: any) {
	const headerModule = findModule((m) => m.Header && m.CollectionName && m.DynamicCollectionLabelAndButton);

	if (!headerModule || !headerModule.Header) {
		console.warn('[Sortium] Could not find the specific Header module.');
		return;
	}

	const headerDiv = await waitForElement(`div.${headerModule.Header}`, popup.m_popup.document);
	if (!headerDiv) return;

	const oldSortiumToggle = headerDiv.querySelector('div.sortium-toggle');
	if (!oldSortiumToggle) {
		const sortiumToggle = popup.m_popup.document.createElement('div');
		sortiumToggle.className = 'sortium-toggle';

		const sortiumRoot = createRoot(sortiumToggle);
		sortiumRoot.render(<SortiumToggle popup={popup} />);

		headerDiv.insertBefore(sortiumToggle, headerDiv.firstChild);
	}
}

export async function injectSortiumGrid(popup: any) {
	const headerModule = findModule((m) => m.Header && m.CollectionName && m.DynamicCollectionLabelAndButton);

	if (!headerModule || !headerModule.Header) {
		console.warn('[Sortium] Could not find the Header module for grid injection.');
		return;
	}

	const headerDiv = await waitForElement(`div.${headerModule.Header}`, popup.m_popup.document);
	if (!headerDiv || !headerDiv.parentNode) return;

	const oldSortiumGrid = headerDiv.parentNode.querySelector('div.sortium-custom-grid-container');
	if (!oldSortiumGrid) {
		const sortiumGridDiv = popup.m_popup.document.createElement('div');
		sortiumGridDiv.className = 'sortium-grid';

		sortiumGridDiv.style.height = '0px';
		sortiumGridDiv.style.overflow = 'hidden';
		sortiumGridDiv.style.visibility = 'hidden';

		const gridRoot = createRoot(sortiumGridDiv);
		gridRoot.render(<SortiumGrid popup={popup} />);

		headerDiv.parentNode.insertBefore(sortiumGridDiv, headerDiv.nextSibling);
	}
}
