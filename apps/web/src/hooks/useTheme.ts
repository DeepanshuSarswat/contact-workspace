import { useEffect, useState } from 'react';
import {
  applyTheme,
  loadThemeChoice,
  resolveTheme,
  saveThemeChoice,
  watchSystemTheme,
  type ThemeChoice,
} from '../lib/theme';

// "system" follows OS changes live
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(loadThemeChoice);

  useEffect(() => {
    applyTheme(resolveTheme(choice));
    saveThemeChoice(choice);
    if (choice !== 'system') return;
    return watchSystemTheme(() => applyTheme(resolveTheme('system')));
  }, [choice]);

  return { choice, setChoice };
}
