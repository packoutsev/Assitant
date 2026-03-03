import type { CleaningSheet, CleaningType, SheetStatus } from '../types';

const CLEANING_TYPES: { value: CleaningType; label: string }[] = [
  { value: 'fire', label: 'Fire' },
  { value: 'water', label: 'Water' },
  { value: 'post-construction', label: 'Post-Construction' },
];

const STATUSES: { value: SheetStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
];

interface Props {
  sheet: CleaningSheet;
  onChange: (updates: Partial<CleaningSheet>) => void;
}

export default function SheetHeader({ sheet, onChange }: Props) {
  return (
    <div className="space-y-3">
      {/* Customer + Address */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">CUSTOMER</label>
          <input
            type="text"
            value={sheet.customer}
            onChange={e => onChange({ customer: e.target.value })}
            placeholder="Last, First"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-navy focus:ring-1 focus:ring-navy outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">CLAIM #</label>
          <input
            type="text"
            value={sheet.claim_number}
            onChange={e => onChange({ claim_number: e.target.value })}
            placeholder="Optional"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-navy focus:ring-1 focus:ring-navy outline-none"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1">ADDRESS</label>
        <input
          type="text"
          value={sheet.address}
          onChange={e => onChange({ address: e.target.value })}
          placeholder="Street, City, AZ"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-navy focus:ring-1 focus:ring-navy outline-none"
        />
      </div>

      {/* Type + Status */}
      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">CLEANING TYPE</label>
          <div className="flex gap-1">
            {CLEANING_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => onChange({ cleaning_type: t.value })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  sheet.cleaning_type === t.value
                    ? 'bg-navy text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">STATUS</label>
          <div className="flex gap-1">
            {STATUSES.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => onChange({ status: s.value })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  sheet.status === s.value
                    ? s.value === 'complete' ? 'bg-emerald-500 text-white' : 'bg-navy text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
