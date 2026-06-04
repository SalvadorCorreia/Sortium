import { Dropdown, staticClasses } from '@steambrew/client';
import { getSettings, saveSettings } from '../services/settings';
import { log } from '../services/logger';

export function SortiumDropdown() {
  // Use React directly, not window.SP_REACT
  // Note: Depending on your build system (Vite/Webpack), you might need to import React
  // If Millennium injects React into scope automatically, this works as is.
  const [selected, setSelected] = React.useState<string>(
    getSettings().activeSortCategory || 'main_story'
  );

  const options = [
    { label: 'HLTB: Main Story', data: 'main_story' },
    { label: 'HLTB: Main + Extras', data: 'main_extra' },
    { label: 'HLTB: Completionist', data: 'completionist' },
    { label: 'SteamHunters: Median Time', data: 'median_time' },
  ];

  const handleChange = (selectedData: string) => {
    setSelected(selectedData);
    saveSettings({ ...getSettings(), activeSortCategory: selectedData });
    log('Sort category changed to', selectedData);
    
    // Future Implementation: Trigger the actual library sort here
  };

  return (
    // We use standard React styling, but try to piggyback off Steam's class names
    // if we know them. Otherwise, standard inline flexbox is fine for layout.
    <div 
      className="sortium-dropdown-container" 
      style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}
    >
      <span 
        className={staticClasses.libraryAssetImageClasses} // Example of using a Steam class for styling
        style={{ color: '#b8b6b4', textTransform: 'uppercase', fontSize: '12px', fontWeight: 'bold' }}
      >
        Sortium
      </span>
      <Dropdown
        rgOptions={options}
        selectedOption={selected}
        onChange={handleChange}
        contextMenuPosition="bottom"
      />
    </div>
  );
}
