import type { CleaningSheet, Room, LineItem, SoilageLevel } from '../types';

function soilageModifier(level?: SoilageLevel): string {
  if (level === 'light') return '-';
  if (level === 'heavy') return '+';
  return '';
}

function formatCode(item: LineItem): string {
  return `${item.xact_code}${soilageModifier(item.soilage_level)}`;
}

function formatLine(item: LineItem): string {
  const code = formatCode(item).padEnd(16);
  const desc = item.description.padEnd(32);
  const qty = `${item.quantity} ${item.unit}`;
  return `  ${code}${desc}${qty}`;
}

function roomLines(room: Room): string[] {
  const all = [...room.surfaces, ...room.treatments, ...room.post_construction];
  const checked = all.filter(i => i.checked && i.quantity > 0);
  if (checked.length === 0) return [];
  return [
    room.name.toUpperCase(),
    ...checked.map(formatLine),
  ];
}

export function generateScopeSummary(sheet: CleaningSheet): string {
  const header = [
    `CLEANING SCOPE — ${sheet.customer}`,
    sheet.address,
    `Claim: ${sheet.claim_number || 'N/A'}`,
    `Type: ${sheet.cleaning_type.replace('-', ' ').toUpperCase()}`,
    `Status: ${sheet.status.toUpperCase()}`,
    '',
  ];

  const body = sheet.rooms.flatMap((room, i) => {
    const lines = roomLines(room);
    if (lines.length === 0) return [];
    return i > 0 ? ['', ...lines] : lines;
  });

  if (body.length === 0) {
    return [...header, '(No items scoped yet)'].join('\n');
  }

  return [...header, ...body].join('\n');
}

export interface ScopeLine {
  room: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  soilage?: SoilageLevel;
}

export function getScopeLines(sheet: CleaningSheet): ScopeLine[] {
  return sheet.rooms.flatMap(room => {
    const all = [...room.surfaces, ...room.treatments, ...room.post_construction];
    return all
      .filter(i => i.checked && i.quantity > 0)
      .map(i => ({
        room: room.name,
        code: formatCode(i),
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        soilage: i.soilage_level,
      }));
  });
}
