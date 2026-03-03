export type VaultStatus = 'occupied' | 'empty' | 'pallet' | 'mold';

export type FlagReason =
  | 'ar-past-due'      // A/R: customer has outstanding invoices
  | 'ar-escalated'     // A/R: escalated to supervisor / collections
  | 'mold-hazard'      // Mold or biohazard concern
  | 'needs-verify'     // Contents or vault assignment needs verification
  | 'other';           // Catch-all

export const FLAG_CONFIG: Record<FlagReason, { label: string; color: string; dotColor: string; bgColor: string }> = {
  'ar-past-due':  { label: 'A/R Past Due',     color: 'text-orange-400', dotColor: '#f97316', bgColor: 'bg-orange-900/40' },
  'ar-escalated': { label: 'A/R Escalated',    color: 'text-red-400',    dotColor: '#ef4444', bgColor: 'bg-red-900/40' },
  'mold-hazard':  { label: 'Mold / Hazard',    color: 'text-rose-400',   dotColor: '#fb7185', bgColor: 'bg-rose-900/40' },
  'needs-verify': { label: 'Needs Verification', color: 'text-yellow-400', dotColor: '#facc15', bgColor: 'bg-yellow-900/40' },
  'other':        { label: 'Other',             color: 'text-gray-400',   dotColor: '#94a3b8', bgColor: 'bg-gray-800' },
};

export interface Vault {
  /** Unique ID: zone-row-position (e.g., "back-wall-row-1-0") */
  id: string;
  vaultNum: string;
  customer: string;
  status: VaultStatus;
  flagReason: FlagReason | null;
  notes: string;
  claimId?: string;
  dateStored?: string;
  /** Billing fields from project spreadsheet */
  dateReceived?: string;
  billedThrough?: string;
  datePastDue?: string;
  storagePending?: string;
  zoneId: string;
  rowId: string;
  position: number;
}

export interface Customer {
  name: string;
  aliases: string[];
  claimId: string;
  notes: string;
  arBalance?: number;
  arStatus?: string;
}

/** A box or TAG item tracked inside a vault */
export interface BoxItem {
  id: string;
  /** 'box' or 'tag' */
  type: 'box' | 'tag';
  /** Sequential number: "1", "2", etc. */
  itemNumber: string;
  /** Project / customer name */
  customer: string;
  /** Project number / claim ID (e.g. "25-91-C") */
  projectNumber: string;
  /** Packout date (YYYY-MM-DD) */
  packoutDate: string;
  /** Room the item came from (assigned during packout, not at print time) */
  room?: string;
  /** Description or contents note */
  description?: string;
  /** Vault ID this item is currently in */
  vaultId: string;
  /** Timestamp scanned into the vault */
  scannedIn: number;
  /** Timestamp scanned out (null = still in vault) */
  scannedOut: number | null;
}

/**
 * QR code payload encoded on each label.
 * Format: "1800PO|{type}|{itemNumber}|{customer}|{projectNumber}|{packoutDate}"
 */
export function encodeQRPayload(item: { type: 'box' | 'tag'; itemNumber: string; customer: string; projectNumber: string; packoutDate: string }): string {
  return `1800PO|${item.type.toUpperCase()}|${item.itemNumber}|${item.customer}|${item.projectNumber}|${item.packoutDate}`;
}

export function decodeQRPayload(raw: string): { type: 'box' | 'tag'; itemNumber: string; customer: string; projectNumber: string; packoutDate: string } | null {
  const parts = raw.split('|');
  if (parts.length < 4 || parts[0] !== '1800PO') return null;
  const t = parts[1].toLowerCase();
  if (t !== 'box' && t !== 'tag') return null;
  return {
    type: t as 'box' | 'tag',
    itemNumber: parts[2],
    customer: parts[3],
    projectNumber: parts[4] || '',
    packoutDate: parts[5] || '',
  };
}

export type RowType = 'vault' | 'large-pallet' | 'small-pallet';

export const ROW_TYPE_CONFIG: Record<RowType, { label: string; w: number; h: number; d: number }> = {
  'vault':         { label: 'Vault',         w: 7, h: 7, d: 5 },
  'large-pallet':  { label: 'Large Pallet',  w: 7, h: 2, d: 5 },
  'small-pallet':  { label: 'Small Pallet',  w: 4, h: 2, d: 4 },
};

export interface VaultRow {
  id: string;
  label?: string;
  rowType?: RowType;
  vaults: Vault[];
}

export type LayoutHint = 'back-wall' | 'center' | 'floor' | 'offsite';

export interface Zone {
  id: string;
  name: string;
  layoutHint?: LayoutHint;
  rows: VaultRow[];
}

export interface ActivityEntry {
  id: string;
  timestamp: number;
  action: 'assign' | 'unassign' | 'move' | 'swap' | 'edit' | 'flag' | 'unflag' | 'layout';
  vaultId: string;
  vaultNum: string;
  details: string;
  user: string;
}

export interface WarehouseState {
  zones: Zone[];
  customers: Customer[];
  activityLog: ActivityEntry[];
}
