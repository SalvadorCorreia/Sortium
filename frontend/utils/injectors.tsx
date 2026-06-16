import { findModule } from '@steambrew/client';
import { createRoot } from 'react-dom/client';
import { SortiumDropdown } from '../ui/SortiumDropdown.tsx';
import { waitForElement, waitForAllElements } from './dom.ts';

export async function injectHomeDropdowns(popup: any) {
	const headers = await waitForAllElements(`div.${findModule((e) => e.ShowcaseHeader).ShowcaseHeader}`, popup.m_popup.document);
	headers.forEach((headerDiv) => {
		const oldSortiumDropdown = headerDiv.querySelector('div.sortium-dropdown');
		if (!oldSortiumDropdown) {
			const sortiumDropdown = popup.m_popup.document.createElement('div');
			sortiumDropdown.className = 'sortium-dropdown';

			const sortiumRoot = createRoot(sortiumDropdown);
			sortiumRoot.render(<SortiumDropdown />);

			headerDiv.insertBefore(sortiumDropdown, headerDiv.firstChild!.nextSibling!.nextSibling);
		}
	});
}

export async function injectCollectionDropdown(popup: any) {
	const collOptionsDiv = await waitForElement(`div.${findModule((e) => e.CollectionOptions).CollectionOptions}`, popup.m_popup.document);
	const oldSortiumDropdown = collOptionsDiv.querySelector('div.sortium-dropdown');

	if (!oldSortiumDropdown) {
		const sortiumDropdown = popup.m_popup.document.createElement('div');
		sortiumDropdown.className = 'sortium-dropdown';

		const sortiumRoot = createRoot(sortiumDropdown);
		sortiumRoot.render(<SortiumDropdown variant="collection" />);

		collOptionsDiv.insertBefore(sortiumDropdown, collOptionsDiv.firstChild!.nextSibling);
	}
}
