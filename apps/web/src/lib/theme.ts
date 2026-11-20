export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

// must match the script in index.html
export const THEME_STORAGE_KEY = 'theme';
const CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

const darkQuery = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

export function systemTheme(): ResolvedTheme {
  return darkQuery()?.matches ? 'dark' : 'light';
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice;
}

// storage can be blocked (private mode); the app still works, it just forgets
export function loadThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return CHOICES.includes(saved as ThemeChoice) ? (saved as ThemeChoice) : 'system';
  } catch {
    return 'system';
  }
}

export function saveThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // storage blocked: the theme still applies, it just isn't remembered
  }
}

export function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
}

export function watchSystemTheme(onChange: () => void): () => void {
  const query = darkQuery();
  if (!query) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
