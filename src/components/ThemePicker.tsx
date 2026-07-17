import { Check, Laptop, MoonStar, Palette, Sparkles, Sun } from 'lucide-react';
import { useRef } from 'react';
import { useTheme, type ThemePreference } from '../context/ThemeContext';

const options: Array<{
  value: ThemePreference;
  label: string;
  detail: string;
  icon: typeof Sun;
}> = [
  { value: 'system', label: 'Use system', detail: 'Follow this device', icon: Laptop },
  { value: 'midnight', label: 'Midnight', detail: 'Deep green dark', icon: MoonStar },
  { value: 'daylight', label: 'Daylight', detail: 'Warm paper light', icon: Sun },
  { value: 'dusk', label: 'Dusk', detail: 'Plum and amber', icon: Sparkles },
];

export function ThemePicker({ className = '' }: { className?: string }) {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const choose = (nextPreference: ThemePreference) => {
    setPreference(nextPreference);
    detailsRef.current?.removeAttribute('open');
  };

  return (
    <details className={`theme-picker ${className}`.trim()} ref={detailsRef}>
      <summary className="icon-button theme-picker-trigger" aria-label={`Choose color theme. Current theme: ${resolvedTheme}`} title="Choose color theme">
        <Palette size={17} />
      </summary>
      <div className="theme-menu" role="menu" aria-label="Color theme">
        <div className="theme-menu-heading"><span>Appearance</span><small>{resolvedTheme}</small></div>
        {options.map(({ value, label, detail, icon: Icon }) => (
          <button key={value} type="button" role="menuitemradio" aria-checked={preference === value} className={preference === value ? 'selected' : ''} onClick={() => choose(value)}>
            <span className={`theme-swatch theme-swatch-${value}`}><Icon size={15} /></span>
            <span><strong>{label}</strong><small>{detail}</small></span>
            {preference === value && <Check size={15} />}
          </button>
        ))}
      </div>
    </details>
  );
}
