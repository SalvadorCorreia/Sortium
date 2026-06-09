import { Dropdown, findModule } from '@steambrew/client';
import { useState } from 'react';
import { getSettings, saveSettings } from '../services/settings';

interface SortiumDropdownProps {
  variant?: 'default' | 'collection';
}

export function SortiumDropdown({ variant = 'default' }: SortiumDropdownProps) {

  const currentSettings = getSettings();
  
  // Initialize state using the correct property from your settings.ts
  const [selected, setSelected] = useState<string>(
    currentSettings.lastUsedMetric || 'hltb_main'
  );

  // MVP: Hardcoded options to prove the UI renders
  const options = [
    { label: 'HLTB: Main Story', data: 'hltb_main' },
    { label: 'HLTB: Main + Extras', data: 'hltb_extras' },
    { label: 'HLTB: Completionist', data: 'hltb_completionist' },
    { label: 'SteamHunters: Median', data: 'sh_median' },
  ];

  const handleChange = (option: { data: string; label: string }) => {
    const selectedData = option.data; // Extract the string value
    setSelected(selectedData);
    saveSettings({ ...currentSettings, lastUsedMetric: selectedData });
    console.log('[Sortium] Sort category changed to:', selectedData);
  };

  // ------------------------------------------
  // RENDER LOGIC: Switch based on the variant
  // ------------------------------------------
  if (variant === 'collection') {
	const sortModule = findModule(m => m.SortingDropDown && m.SortingDropDownLabel) || {};
    return (
      <div className={sortModule.SortingDropDown} tabIndex={-1}>
        <div className={sortModule.SortingDropDownLabel}>
          Sortium
        </div>
        <Dropdown
          rgOptions={options}
          selectedOption={selected}
          onChange={handleChange}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
      <span style={{ color: '#b8b6b4', textTransform: 'uppercase', fontSize: '12px', fontWeight: 'bold' }}>
        Sortium
      </span>
      <Dropdown
        rgOptions={options}
        selectedOption={selected}
        onChange={handleChange}
      />
    </div>
  );
}
