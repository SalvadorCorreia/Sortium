import { SORTIUM_ROOT_ID, SORTIUM_STYLE_ID } from '../injection/constants';

export function injectSortiumStyles(doc: Document) {
if (doc.getElementById(SORTIUM_STYLE_ID)) {
return;
}

const style = doc.createElement('style');
style.id = SORTIUM_STYLE_ID;
style.textContent = `
#${SORTIUM_ROOT_ID} {
display: inline-flex;
margin-left: 8px;
vertical-align: middle;
}

#${SORTIUM_ROOT_ID} .sortium-dropdown-shell {
display: inline-flex;
align-items: center;
gap: 6px;
padding: 0 10px;
height: 30px;
border-radius: 4px;
border: 1px solid rgba(255, 255, 255, 0.18);
background: rgba(35, 39, 46, 0.85);
color: #e5e7eb;
font-size: 12px;
}

#${SORTIUM_ROOT_ID} .sortium-dropdown-label {
font-weight: 600;
letter-spacing: 0.02em;
text-transform: uppercase;
}

#${SORTIUM_ROOT_ID} .sortium-dropdown-select {
border: none;
background: transparent;
color: inherit;
font-size: 12px;
outline: none;
max-width: 220px;
}

#${SORTIUM_ROOT_ID} .sortium-dropdown-select option {
background: #1f2937;
color: #e5e7eb;
}
`;

(doc.head ?? doc.documentElement).appendChild(style);
}

export function removeSortiumStyles(doc: Document) {
doc.getElementById(SORTIUM_STYLE_ID)?.remove();
}
