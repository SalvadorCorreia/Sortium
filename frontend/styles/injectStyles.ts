const ROOT_ID = 'sortium-root';
const STYLE_ID = 'sortium-styles';

export function injectSortiumStyles(doc: Document) {
  if (doc.getElementById(STYLE_ID)) {
    return;
  }

  const style = doc.createElement('style');
  style.id = STYLE_ID;
  
  // Only the root positioning is needed. Steambrew handles the rest.
  style.textContent = `
    #${ROOT_ID} {
      display: inline-flex;
      margin-left: 8px;
      vertical-align: middle;
    }
  `;

  (doc.head ?? doc.documentElement).appendChild(style);
}

export function removeSortiumStyles(doc: Document) {
  doc.getElementById(STYLE_ID)?.remove();
}
