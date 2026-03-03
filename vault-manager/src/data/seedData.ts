import type { Zone, Customer, Vault, FlagReason } from '../types';

interface RawVault {
  vaultNum: string;
  customer: string;
  status: 'occupied' | 'empty' | 'pallet' | 'mold';
  flagReason?: FlagReason | null;
  notes?: string;
  dateReceived?: string;
  billedThrough?: string;
  datePastDue?: string;
  storagePending?: string;
}

function buildVaults(zoneId: string, rowId: string, raw: RawVault[]): Vault[] {
  return raw.map((v, i) => ({
    id: `${zoneId}__${rowId}__${i}`,
    vaultNum: v.vaultNum,
    customer: v.customer,
    status: v.status,
    flagReason: v.flagReason || null,
    notes: v.notes || '',
    zoneId,
    rowId,
    position: i,
    dateReceived: v.dateReceived,
    billedThrough: v.billedThrough,
    datePastDue: v.datePastDue,
    storagePending: v.storagePending,
  }));
}

// -----------------------------------------------------------------------
// Customers — in-person warehouse audit 2026-02-24.
// Only 5 active customers remain in vaults.
// All others (Love, Smith, Clark, Courter, Goldman, Torres, Cote) have
// packed back and are no longer in the warehouse.
// -----------------------------------------------------------------------

export const seedCustomers: Customer[] = [
  {
    name: 'Bryant, Michael',
    aliases: ['Michael Bryant'],
    claimId: '3857051',
    notes: '13 vaults. Racking: 9A, 11B. A/R escalated — contacting adjuster since Dec 2025.',
    arBalance: 17694.63,
    arStatus: 'Escalated — contacting adjuster since Dec 2025',
  },
  {
    name: 'Hart, Frank',
    aliases: ['Frank Hart'],
    claimId: '4221766',
    notes: '10 vaults + Pallet F, Pallet P. Documentation being reviewed.',
    arBalance: 35539.74,
    arStatus: 'Documentation being reviewed',
  },
  {
    name: 'Campbell, Lauren',
    aliases: ['Erik Campbell', 'Lauren Campbell'],
    claimId: '4277645',
    notes: '4 vaults. State Farm denial — waiting on customer decision.',
    arBalance: 14349.53,
    arStatus: 'State Farm denial — waiting on customer decision',
  },
  {
    name: 'Schafer, Tyler',
    aliases: ['Tyler Schafer'],
    claimId: '4316490',
    notes: '4 vaults. Racking: P1, 16sqft, $68/mo. Invoice sent 2/19/2026, adjuster contacted.',
    arBalance: 11300.78,
    arStatus: 'Invoice sent 2/19, adjuster contacted',
  },
  {
    name: 'Duginski, Chuck',
    aliases: ['Claire Duginski'],
    claimId: '4014181',
    notes: '3 vaults + pallet P. Past due — $300 pending.',
    arBalance: 300,
    arStatus: 'Past due — $300 pending',
  },
];

// -----------------------------------------------------------------------
// Warehouse layout — 4 zones matching the physical warehouse structure.
// Vault contents reflect the CURRENT state as of 2026-02-24 in-person audit.
//
// Middle aisle rows are equal (12 + 12 per whiteboard).
// -----------------------------------------------------------------------

export const seedZones: Zone[] = [
  // =====================================================================
  // BACK WALL — Top Row (racking against back wall, single long row)
  // Hart (6), Bryant (6), Campbell (2), plus 6 empties (formerly Love)
  // =====================================================================
  {
    id: 'back-wall',
    name: 'Back Wall \u2014 Top Row',
    rows: [
      {
        id: 'back-wall-row-1',
        vaults: buildVaults('back-wall', 'back-wall-row-1', [
          // Hart vaults (left section)
          { vaultNum: '3',  customer: 'Hart, Frank',      status: 'occupied', notes: '', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          { vaultNum: '5',  customer: 'Hart, Frank',      status: 'occupied', notes: '', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          { vaultNum: '9',  customer: 'Hart, Frank',      status: 'occupied', notes: '', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          { vaultNum: '10', customer: 'Hart, Frank',      status: 'occupied', notes: '', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          { vaultNum: '12', customer: 'Hart, Frank',      status: 'occupied', notes: '', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          { vaultNum: '16', customer: 'Hart, Frank',      status: 'occupied', notes: '', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          // Bryant vaults (center-left section)
          { vaultNum: '37', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: 'Racking: 9A, 11B', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          { vaultNum: '53', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          { vaultNum: '50', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          { vaultNum: '57', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          { vaultNum: '66', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          { vaultNum: '8',  customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          // Empty (formerly Love)
          { vaultNum: '55', customer: '', status: 'empty', notes: 'Formerly Love' },
          { vaultNum: '27', customer: '', status: 'empty', notes: 'Formerly Love' },
          { vaultNum: '13', customer: '', status: 'empty', notes: 'Formerly Love' },
          { vaultNum: '67', customer: '', status: 'empty', notes: 'Formerly Love' },
          { vaultNum: '1',  customer: '', status: 'empty', notes: 'Formerly Love' },
          { vaultNum: '40', customer: '', status: 'empty', notes: 'Formerly Love' },
          // Campbell vaults (right section)
          { vaultNum: '29', customer: 'Campbell, Lauren', status: 'occupied', flagReason: 'ar-past-due', notes: 'State Farm denial', dateReceived: '1/29/2026', billedThrough: '3/28/2026', datePastDue: '3/29/2026' },
          { vaultNum: '31', customer: 'Campbell, Lauren', status: 'occupied', flagReason: 'ar-past-due', notes: '', dateReceived: '1/29/2026', billedThrough: '3/28/2026', datePastDue: '3/29/2026' },
        ]),
      },
    ],
  },

  // =====================================================================
  // CENTER AISLE — Double Sided racking (equal rows: 12 + 12 = 24)
  // North: Bryant overflow (7) + 5 empties = 12
  // South: Hart overflow (4) + Campbell (1) + 7 empties = 12
  // =====================================================================
  {
    id: 'center-aisle',
    name: 'Center Aisle \u2014 Double Sided',
    rows: [
      {
        id: 'center-north',
        label: 'North Side (Row 1)',
        vaults: buildVaults('center-aisle', 'center-north', [
          // Bryant overflow
          { vaultNum: '52', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          { vaultNum: '62', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          { vaultNum: '46', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          { vaultNum: '43', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          { vaultNum: '64', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          { vaultNum: '73', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          { vaultNum: '59', customer: 'Bryant, Michael',  status: 'occupied', flagReason: 'ar-escalated', notes: '', dateReceived: '8/21/2025', billedThrough: '2/20/2026', datePastDue: '2/21/2026' },
          // Empty (5 positions)
          { vaultNum: '2',  customer: '', status: 'empty', notes: '' },
          { vaultNum: '11', customer: '', status: 'empty', notes: '' },
          { vaultNum: '23', customer: '', status: 'empty', notes: '' },
          { vaultNum: '17', customer: '', status: 'empty', notes: '' },
          { vaultNum: '56', customer: '', status: 'empty', notes: '' },
        ]),
      },
      {
        id: 'center-south',
        label: 'South Side (Row 2)',
        vaults: buildVaults('center-aisle', 'center-south', [
          // Hart overflow
          { vaultNum: '26', customer: 'Hart, Frank',      status: 'occupied', notes: '', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          { vaultNum: '35', customer: 'Hart, Frank',      status: 'occupied', notes: '', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          { vaultNum: '51', customer: 'Hart, Frank',      status: 'occupied', notes: '', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          { vaultNum: '54', customer: 'Hart, Frank',      status: 'occupied', notes: '', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          // Campbell overflow
          { vaultNum: '63', customer: 'Campbell, Lauren', status: 'occupied', flagReason: 'ar-past-due', notes: '', dateReceived: '1/29/2026', billedThrough: '3/28/2026', datePastDue: '3/29/2026' },
          // Empty (7 positions)
          { vaultNum: '24', customer: '', status: 'empty', notes: '' },
          { vaultNum: '28', customer: '', status: 'empty', notes: '' },
          { vaultNum: '45', customer: '', status: 'empty', notes: '' },
          { vaultNum: '68', customer: '', status: 'empty', notes: '' },
          { vaultNum: '15', customer: '', status: 'empty', notes: '' },
          { vaultNum: '69', customer: '', status: 'empty', notes: '' },
          { vaultNum: '4',  customer: '', status: 'empty', notes: '' },
        ]),
      },
    ],
  },

  // =====================================================================
  // FLOOR SOUTH — Center
  // Schafer (4) + Pallets (Hart 2 + Campbell #32)
  // =====================================================================
  {
    id: 'floor-south-center',
    name: 'Floor South \u2014 Center',
    rows: [
      {
        id: 'floor-center-row1',
        label: 'Schafer',
        vaults: buildVaults('floor-south-center', 'floor-center-row1', [
          { vaultNum: '71', customer: 'Schafer, Tyler',   status: 'occupied', notes: 'Racking: P1, 16sqft, $68/mo', dateReceived: '2/16/2026', billedThrough: '4/15/2026', datePastDue: '4/16/2026' },
          { vaultNum: '18', customer: 'Schafer, Tyler',   status: 'occupied', notes: '', dateReceived: '2/16/2026', billedThrough: '4/15/2026', datePastDue: '4/16/2026' },
          { vaultNum: '33', customer: 'Schafer, Tyler',   status: 'occupied', notes: '', dateReceived: '2/16/2026', billedThrough: '4/15/2026', datePastDue: '4/16/2026' },
          { vaultNum: '30', customer: 'Schafer, Tyler',   status: 'occupied', notes: '', dateReceived: '2/16/2026', billedThrough: '4/15/2026', datePastDue: '4/16/2026' },
        ]),
      },
      {
        id: 'floor-center-pallet',
        label: 'Pallets + Campbell',
        vaults: buildVaults('floor-south-center', 'floor-center-pallet', [
          // Hart pallets (3 per whiteboard)
          { vaultNum: 'PF', customer: 'Hart, Frank',      status: 'pallet', notes: 'Pallet F', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          { vaultNum: 'PP', customer: 'Hart, Frank',      status: 'pallet', notes: 'Pallet P', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          { vaultNum: 'P3', customer: 'Hart, Frank',      status: 'pallet', notes: 'Pallet 3', dateReceived: '1/12/2026', billedThrough: '3/11/2026', datePastDue: '3/12/2026' },
          // Schafer pallet (P1 per notes)
          { vaultNum: 'P1', customer: 'Schafer, Tyler',   status: 'pallet', notes: 'Racking P1, 16sqft, $68/mo', dateReceived: '2/16/2026', billedThrough: '4/15/2026', datePastDue: '4/16/2026' },
          // Mold container
          { vaultNum: 'MC', customer: '',                  status: 'mold', notes: 'Container — mold' },
          // Campbell
          { vaultNum: '32', customer: 'Campbell, Lauren', status: 'occupied', flagReason: 'ar-past-due', notes: '', dateReceived: '1/29/2026', billedThrough: '3/28/2026', datePastDue: '3/29/2026' },
        ]),
      },
    ],
  },

  // =====================================================================
  // FLOOR SOUTH — Right Wall
  // Duginski (3 vaults + 1 pallet) + 3 empties
  // =====================================================================
  {
    id: 'floor-south-right',
    name: 'Floor South \u2014 Right Wall',
    rows: [
      {
        id: 'floor-right-row1',
        vaults: buildVaults('floor-south-right', 'floor-right-row1', [
          { vaultNum: '14', customer: 'Duginski, Chuck',  status: 'occupied', flagReason: 'ar-past-due', notes: 'Past due 12/28/2025', dateReceived: '10/28/2025', billedThrough: '12/27/2025', datePastDue: '12/28/2025', storagePending: '$300' },
          { vaultNum: '42', customer: 'Duginski, Chuck',  status: 'occupied', flagReason: 'ar-past-due', notes: '', dateReceived: '10/28/2025', billedThrough: '12/27/2025', datePastDue: '12/28/2025' },
          { vaultNum: '83', customer: 'Duginski, Chuck',  status: 'occupied', flagReason: 'ar-past-due', notes: '', dateReceived: '10/28/2025', billedThrough: '12/27/2025', datePastDue: '12/28/2025' },
        ]),
      },
      {
        id: 'floor-right-row2',
        vaults: buildVaults('floor-south-right', 'floor-right-row2', [
          { vaultNum: 'P',  customer: 'Duginski, Chuck',  status: 'pallet', flagReason: 'ar-past-due', notes: 'Pallet position — Duginski', dateReceived: '10/28/2025', billedThrough: '12/27/2025', datePastDue: '12/28/2025' },
          { vaultNum: '22', customer: '', status: 'empty', notes: '' },
          { vaultNum: '48', customer: '', status: 'empty', notes: '' },
        ]),
      },
    ],
  },
];
