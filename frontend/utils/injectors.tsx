import { findModule } from '@steambrew/client';
import { createRoot } from 'react-dom/client';
import { SortiumDropdown } from '../ui/SortiumDropdown';
import { SortiumToggle } from '../ui/SortiumToggle';
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

export async function injectCollectionDropdown(popup: any) {
	const collOptionsDiv = await waitForElement(`div.${findModule((e) => e.CollectionOptions).CollectionOptions}`, popup.m_popup.document);
	if (!collOptionsDiv) return;

	const oldSortiumDropdown = collOptionsDiv.querySelector('div.sortium-dropdown');
	if (!oldSortiumDropdown) {
		const sortiumDropdown = popup.m_popup.document.createElement('div');
		sortiumDropdown.className = 'sortium-dropdown';

		const sortiumRoot = createRoot(sortiumDropdown);
		sortiumRoot.render(<SortiumDropdown variant="collection" popup={popup} />);

		collOptionsDiv.insertBefore(sortiumDropdown, collOptionsDiv.firstChild!.nextSibling);
	}
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
		sortiumRoot.render(<SortiumToggle />);

		headerDiv.insertBefore(sortiumToggle, headerDiv.firstChild);
	}
}
