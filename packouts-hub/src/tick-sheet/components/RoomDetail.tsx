import { useState, useEffect } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import type { Room, LineItem, CleaningType, RoomDimensions } from '../types';
import { ALL_SECTIONS } from '../data/xactimate-structure-codes';
import { DEFAULT_EXPANDED, DEFAULT_SOILAGE } from '../data/room-presets';
import SurfaceSection from './SurfaceSection';

interface Props {
  room: Room;
  cleaningType: CleaningType;
  onChange: (room: Room) => void;
  onDelete: () => void;
  onBack: () => void;
}

function initItems(codes: { code: string; cat: string; description: string; unit: string; hasSoilage: boolean }[], defaultSoilage: 'light' | 'medium' | 'heavy'): LineItem[] {
  return codes.map(c => ({
    id: c.code,
    xact_code: c.code,
    xact_cat: c.cat,
    description: c.description,
    quantity: 0,
    unit: c.unit,
    soilage_level: c.hasSoilage ? defaultSoilage : undefined,
    checked: false,
  }));
}

/** Merge existing items with code definitions — preserves user data, adds new codes */
function mergeItems(existing: LineItem[], codes: { code: string; cat: string; description: string; unit: string; hasSoilage: boolean }[], defaultSoilage: 'light' | 'medium' | 'heavy'): LineItem[] {
  return codes.map(c => {
    const prev = existing.find(i => i.xact_code === c.code);
    if (prev) return prev;
    return {
      id: c.code,
      xact_code: c.code,
      xact_cat: c.cat,
      description: c.description,
      quantity: 0,
      unit: c.unit,
      soilage_level: c.hasSoilage ? defaultSoilage : undefined,
      checked: false,
    };
  });
}

export default function RoomDetail({ room, cleaningType, onChange, onDelete, onBack }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    new Set(DEFAULT_EXPANDED[cleaningType])
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Ensure all sections have items (handles saved rooms missing newly added codes)
  useEffect(() => {
    const defaultSoilage = DEFAULT_SOILAGE[cleaningType];
    const allItems = [...room.surfaces, ...room.treatments, ...room.post_construction];
    if (allItems.length === 0) {
      // Fresh room — initialize all items
      const surfaces: LineItem[] = [];
      const treatments: LineItem[] = [];
      const postConstruction: LineItem[] = [];
      for (const section of ALL_SECTIONS) {
        const items = initItems(section.codes, defaultSoilage);
        if (['walls_ceiling', 'floors', 'cabinets_counters', 'windows_doors', 'fixtures_trim'].includes(section.id)) {
          surfaces.push(...items);
        } else if (['treatments'].includes(section.id)) {
          treatments.push(...items);
        } else {
          postConstruction.push(...items);
        }
      }
      onChange({ ...room, surfaces, treatments, post_construction: postConstruction });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDimChange = (field: keyof RoomDimensions, value: number) => {
    onChange({ ...room, dimensions: { ...room.dimensions, [field]: value } });
  };

  const handleItemChange = (category: 'surfaces' | 'treatments' | 'post_construction') =>
    (itemId: string, updates: Partial<LineItem>) => {
      onChange({
        ...room,
        [category]: room[category].map(i => i.id === itemId ? { ...i, ...updates } : i),
      });
    };

  const getSectionItems = (sectionId: string): { items: LineItem[]; category: 'surfaces' | 'treatments' | 'post_construction' } => {
    const surfaceSections = ['walls_ceiling', 'floors', 'cabinets_counters', 'windows_doors', 'fixtures_trim'];
    const treatmentSections = ['treatments'];
    if (surfaceSections.includes(sectionId)) return { items: room.surfaces, category: 'surfaces' };
    if (treatmentSections.includes(sectionId)) return { items: room.treatments, category: 'treatments' };
    return { items: room.post_construction, category: 'post_construction' };
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <input
          type="text"
          value={room.name}
          onChange={e => onChange({ ...room, name: e.target.value })}
          className="text-lg font-bold text-gray-800 bg-transparent border-none outline-none flex-1 focus:bg-gray-50 rounded px-1"
          placeholder="Room name"
        />
        <button
          onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)}
          className={`p-2 rounded-lg transition-colors ${confirmDelete ? 'bg-red-100 text-red-600' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}
          title={confirmDelete ? 'Tap again to confirm' : 'Delete room'}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Dimensions */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="text-xs font-semibold text-gray-500 mb-2">DIMENSIONS (ft)</div>
        <div className="grid grid-cols-3 gap-2">
          {(['length', 'width', 'height'] as const).map(f => (
            <div key={f}>
              <label className="text-xs text-gray-400 block mb-0.5">{f.charAt(0).toUpperCase() + f.slice(1)}</label>
              <input
                type="number"
                inputMode="decimal"
                value={room.dimensions[f] || ''}
                onChange={e => handleDimChange(f, Number(e.target.value) || 0)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:border-navy focus:ring-1 focus:ring-navy outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Accordion sections */}
      <div className="space-y-2">
        {ALL_SECTIONS.map(section => {
          const { items, category } = getSectionItems(section.id);
          const sectionCodes = section.codes;
          const sectionItems = items.filter(i => sectionCodes.some(c => c.code === i.xact_code));

          // Merge if section items are missing (new room or new codes added)
          const defaultSoilage = DEFAULT_SOILAGE[cleaningType];
          const mergedItems = sectionItems.length > 0
            ? mergeItems(sectionItems, sectionCodes, defaultSoilage)
            : initItems(sectionCodes, defaultSoilage);

          return (
            <SurfaceSection
              key={section.id}
              sectionId={section.id}
              label={section.label}
              codes={sectionCodes}
              items={mergedItems}
              dimensions={room.dimensions}
              expanded={expanded.has(section.id)}
              onToggleExpand={() => toggleExpand(section.id)}
              onItemChange={handleItemChange(category)}
            />
          );
        })}
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1">ROOM NOTES</label>
        <textarea
          value={room.notes}
          onChange={e => onChange({ ...room, notes: e.target.value })}
          placeholder="Special conditions, exclusions, scope notes..."
          rows={2}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-navy focus:ring-1 focus:ring-navy outline-none resize-none"
        />
      </div>
    </div>
  );
}
