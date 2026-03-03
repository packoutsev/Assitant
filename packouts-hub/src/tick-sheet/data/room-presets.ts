import type { CleaningType, RoomType } from '../types';

/** Which accordion sections auto-expand per cleaning type */
export const DEFAULT_EXPANDED: Record<CleaningType, string[]> = {
  fire: ['walls_ceiling', 'treatments'],
  water: ['floors', 'treatments'],
  'post-construction': ['post_construction', 'fixtures_trim'],
};

/** Default soilage per cleaning type */
export const DEFAULT_SOILAGE: Record<CleaningType, 'light' | 'medium' | 'heavy'> = {
  fire: 'medium',
  water: 'medium',
  'post-construction': 'light',
};

/** Typical dimensions (ft) per room type — can be overridden */
export const ROOM_DIMENSIONS: Record<RoomType, { length: number; width: number; height: number }> = {
  bedroom: { length: 12, width: 12, height: 8 },
  bathroom: { length: 8, width: 6, height: 8 },
  kitchen: { length: 12, width: 10, height: 8 },
  living_room: { length: 16, width: 14, height: 8 },
  dining_room: { length: 12, width: 10, height: 8 },
  family_room: { length: 16, width: 14, height: 8 },
  office: { length: 10, width: 10, height: 8 },
  laundry: { length: 6, width: 6, height: 8 },
  garage: { length: 20, width: 20, height: 10 },
  hallway: { length: 12, width: 4, height: 8 },
  closet: { length: 6, width: 4, height: 8 },
  entry: { length: 6, width: 6, height: 8 },
  utility: { length: 8, width: 6, height: 8 },
  other: { length: 0, width: 0, height: 0 },
};

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  kitchen: 'Kitchen',
  living_room: 'Living Room',
  dining_room: 'Dining Room',
  family_room: 'Family Room',
  office: 'Office',
  laundry: 'Laundry',
  garage: 'Garage',
  hallway: 'Hallway',
  closet: 'Closet',
  entry: 'Entry',
  utility: 'Utility',
  other: 'Other',
};
