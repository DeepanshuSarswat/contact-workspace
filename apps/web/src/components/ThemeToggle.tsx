import { useTheme } from '../hooks/useTheme';
import type { ThemeChoice } from '../lib/theme';
import { IconMonitor, IconMoon, IconSun } from './Icons';

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof IconSun }[] = [
  { value: 'system', label: 'System', Icon: IconMonitor },
  { value: 'light', label: 'Light', Icon: IconSun },
  { value: 'dark', label: 'Dark', Icon: IconMoon },
];

export function ThemeToggle() {
  const { choice, setChoice } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={choice === value}
          aria-label={`${label} theme`}
          title={value === 'system' ? 'Follow your device setting' : `${label} theme`}
          onClick={() => setChoice(value)}
        >
          <Icon size={15} />
          <span className="theme-label">{label}</span>
        </button>
      ))}
    </div>
  );
}
