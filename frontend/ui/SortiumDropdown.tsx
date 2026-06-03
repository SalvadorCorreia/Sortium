import { Dropdown } from '@steambrew/client';
import { getSettings, saveSettings } from '../services/settings';
import { log } from '../services/logger';

export function SortiumDropdown() {
  const settings = getSettings();
  
  // Initialize state from our settings, defaulting to 'main_story' if empty
  const [selected, setSelected] = window.SP_REACT.useState<string>(
    settings.activeSortCategory || 'main_story'
  );

  // Steambrew's Dropdown component expects an array of objects with 'label' and 'data'
  const options = [
    { label: 'HLTB: Main Story', data: 'main_story' },
    { label: 'HLTB: Main + Extras', data: 'main_extra' },
    { label: 'HLTB: Completionist', data: 'completionist' },
    { label: 'SteamHunters: Median Time', data: 'median_time' },
  ];

  // Steam's Dropdown passes the 'data' value directly into the onChange handler
  const handleChange = (selectedData: string) => {
    setSelected(selectedData);
    
    // Save to our backend settings
    saveSettings({ ...settings, activeSortCategory: selectedData });
    log('Sort category changed to', selectedData);
  };

  return (
    <div className="sortium-dropdown-shell" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span className="sortium-dropdown-label" style={{ color: '#b8b6b4', textTransform: 'uppercase', fontSize: '12px' }}>
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
