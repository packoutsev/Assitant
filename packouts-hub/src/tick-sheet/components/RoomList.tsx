import { Plus } from 'lucide-react';
import type { Room, RoomType, CleaningType } from '../types';
import { ROOM_DIMENSIONS, ROOM_TYPE_LABELS } from '../data/room-presets';
import { DEFAULT_SOILAGE } from '../data/room-presets';
import { ALL_SECTIONS } from '../data/xactimate-structure-codes';

interface Props {
  rooms: Room[];
  cleaningType: CleaningType;
  onSelectRoom: (index: number) => void;
  onAddRoom: (room: Room) => void;
}

function countChecked(room: Room): number {
  return [...room.surfaces, ...room.treatments, ...room.post_construction].filter(i => i.checked).length;
}

function createRoom(type: RoomType, cleaningType: CleaningType, existingNames: string[]): Room {
  const baseLabel = ROOM_TYPE_LABELS[type];
  // Auto-number duplicate types
  const sameType = existingNames.filter(n => n.startsWith(baseLabel));
  const name = sameType.length > 0 ? `${baseLabel} ${sameType.length + 1}` : baseLabel;

  const defaultSoilage = DEFAULT_SOILAGE[cleaningType];
  const dims = ROOM_DIMENSIONS[type];

  // Initialize all line items
  const surfaces: Room['surfaces'] = [];
  const treatments: Room['treatments'] = [];
  const postConstruction: Room['post_construction'] = [];

  for (const section of ALL_SECTIONS) {
    const items = section.codes.map(c => ({
      id: c.code,
      xact_code: c.code,
      xact_cat: c.cat,
      description: c.description,
      quantity: 0,
      unit: c.unit,
      soilage_level: c.hasSoilage ? defaultSoilage : undefined,
      checked: false,
    }));
    if (['walls_ceiling', 'floors', 'cabinets_counters', 'windows_doors', 'fixtures_trim'].includes(section.id)) {
      surfaces.push(...items);
    } else if (['treatments'].includes(section.id)) {
      treatments.push(...items);
    } else {
      postConstruction.push(...items);
    }
  }

  return {
    id: crypto.randomUUID(),
    name,
    type,
    dimensions: dims,
    surfaces,
    treatments,
    post_construction: postConstruction,
    notes: '',
  };
}

const QUICK_ROOMS: RoomType[] = ['bedroom', 'bathroom', 'kitchen', 'living_room', 'hallway', 'garage'];

export default function RoomList({ rooms, cleaningType, onSelectRoom, onAddRoom }: Props) {
  return (
    <div className="space-y-3">
      {/* Existing rooms */}
      {rooms.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No rooms yet — add one below</p>
      )}
      {rooms.map((room, i) => {
        const count = countChecked(room);
        return (
          <button
            key={room.id}
            onClick={() => onSelectRoom(i)}
            className="w-full flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-navy/30 hover:shadow-sm transition-all text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-xs font-bold text-sky-700">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">{room.name}</div>
              <div className="text-xs text-gray-400">
                {room.dimensions.length}×{room.dimensions.width}×{room.dimensions.height} ft
                {count > 0 && <span className="ml-2 text-navy font-medium">{count} items</span>}
              </div>
            </div>
          </button>
        );
      })}

      {/* Quick-add buttons */}
      <div>
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Add Room</div>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_ROOMS.map(type => (
            <button
              key={type}
              onClick={() => onAddRoom(createRoom(type, cleaningType, rooms.map(r => r.name)))}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors text-sm text-gray-600"
            >
              <Plus className="w-3.5 h-3.5" />
              {ROOM_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        {/* Other room types */}
        <div className="mt-2">
          <select
            value=""
            onChange={e => {
              if (e.target.value) {
                onAddRoom(createRoom(e.target.value as RoomType, cleaningType, rooms.map(r => r.name)));
              }
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 bg-white focus:border-navy outline-none"
          >
            <option value="">Other room type...</option>
            {Object.entries(ROOM_TYPE_LABELS)
              .filter(([key]) => !QUICK_ROOMS.includes(key as RoomType))
              .map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
          </select>
        </div>
      </div>
    </div>
  );
}
