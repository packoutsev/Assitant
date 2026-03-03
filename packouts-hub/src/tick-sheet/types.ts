export type CleaningType = 'fire' | 'water' | 'post-construction';
export type SoilageLevel = 'light' | 'medium' | 'heavy';
export type SheetStatus = 'draft' | 'in-progress' | 'complete';

export type RoomType =
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'living_room'
  | 'dining_room'
  | 'family_room'
  | 'office'
  | 'laundry'
  | 'garage'
  | 'hallway'
  | 'closet'
  | 'entry'
  | 'utility'
  | 'other';

export interface RoomDimensions {
  length: number;
  width: number;
  height: number;
}

export interface LineItem {
  id: string;
  xact_code: string;
  xact_cat: string;
  description: string;
  quantity: number;
  unit: string;
  soilage_level?: SoilageLevel;
  checked: boolean;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  dimensions: RoomDimensions;
  surfaces: LineItem[];
  treatments: LineItem[];
  post_construction: LineItem[];
  notes: string;
}

export interface CleaningSheet {
  id: string;
  customer: string;
  address: string;
  claim_number: string;
  cleaning_type: CleaningType;
  rooms: Room[];
  status: SheetStatus;
  created_by: string;
  created_at: number;
  updated_at: number;
}

// Computed SF helpers
export function calcWallSF(d: RoomDimensions): number {
  return d.length && d.width && d.height
    ? Math.round(2 * (d.length + d.width) * d.height)
    : 0;
}

export function calcCeilFloorSF(d: RoomDimensions): number {
  return d.length && d.width ? Math.round(d.length * d.width) : 0;
}

export function calcPerimeterLF(d: RoomDimensions): number {
  return d.length && d.width ? Math.round(2 * (d.length + d.width)) : 0;
}
