import { ChevronDown, ChevronRight } from 'lucide-react';
import type { LineItem, RoomDimensions } from '../types';
import { calcWallSF, calcCeilFloorSF, calcPerimeterLF } from '../types';
import type { XactCode } from '../data/xactimate-structure-codes';
import SoilageToggle from './SoilageToggle';

interface Props {
  sectionId: string;
  label: string;
  codes: XactCode[];
  items: LineItem[];
  dimensions: RoomDimensions;
  expanded: boolean;
  onToggleExpand: () => void;
  onItemChange: (itemId: string, updates: Partial<LineItem>) => void;
}

function getAutoQty(autoCalc: XactCode['autoCalc'], dims: RoomDimensions): number {
  switch (autoCalc) {
    case 'wall': return calcWallSF(dims);
    case 'ceilfloor': return calcCeilFloorSF(dims);
    case 'perimeter': return calcPerimeterLF(dims);
    default: return 0;
  }
}

export default function SurfaceSection({
  sectionId: _sectionId,
  label,
  codes,
  items,
  dimensions,
  expanded,
  onToggleExpand,
  onItemChange,
}: Props) {
  const checkedCount = items.filter(i => i.checked).length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        }
        <span className="text-sm font-semibold text-gray-700 flex-1">{label}</span>
        {checkedCount > 0 && (
          <span className="text-xs bg-navy text-white px-1.5 py-0.5 rounded-full">{checkedCount}</span>
        )}
      </button>

      {expanded && (
        <div className="divide-y divide-gray-100">
          {codes.map(code => {
            const item = items.find(i => i.xact_code === code.code);
            if (!item) return null;
            const autoQty = getAutoQty(code.autoCalc, dimensions);

            return (
              <div key={code.code} className="px-3 py-2 flex items-center gap-2 flex-wrap">
                {/* Checkbox + description */}
                <label className="flex items-center gap-2 flex-1 min-w-[180px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={e => {
                      const updates: Partial<LineItem> = { checked: e.target.checked };
                      // Auto-populate quantity when checking
                      if (e.target.checked && item.quantity === 0 && autoQty > 0) {
                        updates.quantity = autoQty;
                      }
                      onItemChange(item.id, updates);
                    }}
                    className="w-5 h-5 rounded border-gray-300 text-navy accent-navy shrink-0"
                  />
                  <div>
                    <span className="text-sm text-gray-800">{code.description}</span>
                    <span className="text-xs text-gray-400 ml-1.5">{code.code}</span>
                  </div>
                </label>

                {/* Soilage toggle */}
                {code.hasSoilage && item.checked && (
                  <SoilageToggle
                    value={item.soilage_level}
                    onChange={level => onItemChange(item.id, { soilage_level: level })}
                  />
                )}

                {/* Quantity input */}
                {item.checked && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={item.quantity || ''}
                      onChange={e => onItemChange(item.id, { quantity: Number(e.target.value) || 0 })}
                      placeholder={autoQty > 0 ? String(autoQty) : '0'}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:border-navy focus:ring-1 focus:ring-navy outline-none"
                    />
                    <span className="text-xs text-gray-400 w-6">{code.unit}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
