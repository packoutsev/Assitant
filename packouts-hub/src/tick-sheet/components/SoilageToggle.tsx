import type { SoilageLevel } from '../types';

const LEVELS: { value: SoilageLevel; label: string; color: string; activeColor: string }[] = [
  { value: 'light', label: 'L', color: 'text-gray-500', activeColor: 'bg-emerald-500 text-white' },
  { value: 'medium', label: 'M', color: 'text-gray-500', activeColor: 'bg-amber-500 text-white' },
  { value: 'heavy', label: 'H', color: 'text-gray-500', activeColor: 'bg-red-500 text-white' },
];

interface Props {
  value?: SoilageLevel;
  onChange: (level: SoilageLevel) => void;
}

export default function SoilageToggle({ value, onChange }: Props) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
      {LEVELS.map(l => (
        <button
          key={l.value}
          type="button"
          onClick={() => onChange(l.value)}
          className={`w-8 h-7 rounded-md text-xs font-bold transition-colors ${
            value === l.value ? l.activeColor : `${l.color} hover:bg-gray-200`
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
