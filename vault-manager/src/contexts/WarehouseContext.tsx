import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type { Zone, Customer, Vault, ActivityEntry, VaultStatus, RowType, LayoutHint } from '../types';
import { FLAG_CONFIG } from '../types';
import { seedZones, seedCustomers } from '../data/seedData';

interface WarehouseState {
  zones: Zone[];
  customers: Customer[];
  activityLog: ActivityEntry[];
  selectedVaultId: string | null;
  searchQuery: string;
  highlightedCustomer: string | null;
  showActivityLog: boolean;
  showCustomerSidebar: boolean;
}

type Action =
  | { type: 'SELECT_VAULT'; vaultId: string | null }
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'HIGHLIGHT_CUSTOMER'; customer: string | null }
  | { type: 'TOGGLE_ACTIVITY_LOG' }
  | { type: 'TOGGLE_CUSTOMER_SIDEBAR' }
  | { type: 'UPDATE_VAULT'; vaultId: string; updates: Partial<Vault> }
  | { type: 'MARK_EMPTY'; vaultId: string }
  | { type: 'MOVE_CUSTOMER'; fromVaultId: string; toVaultId: string }
  | { type: 'LOG_ACTIVITY'; entry: Omit<ActivityEntry, 'id' | 'timestamp'> }
  // Layout actions
  | { type: 'ADD_ZONE'; name: string; layoutHint: LayoutHint; rowType: RowType; vaultCount: number }
  | { type: 'REMOVE_ZONE'; zoneId: string }
  | { type: 'RENAME_ZONE'; zoneId: string; name: string }
  | { type: 'ADD_ROW'; zoneId: string; rowType: RowType; vaultCount: number; label?: string }
  | { type: 'REMOVE_ROW'; zoneId: string; rowId: string }
  | { type: 'ADD_VAULTS'; zoneId: string; rowId: string; count: number }
  | { type: 'REMOVE_VAULT'; vaultId: string }
  | { type: 'REORDER_ZONES'; fromIndex: number; toIndex: number }
  | { type: 'REORDER_ROWS'; zoneId: string; fromIndex: number; toIndex: number }
  | { type: 'RESET_WAREHOUSE' };

function findVault(zones: Zone[], vaultId: string): Vault | undefined {
  for (const zone of zones) {
    for (const row of zone.rows) {
      const v = row.vaults.find(v => v.id === vaultId);
      if (v) return v;
    }
  }
  return undefined;
}

function updateVaultInZones(zones: Zone[], vaultId: string, updates: Partial<Vault>): Zone[] {
  return zones.map(zone => ({
    ...zone,
    rows: zone.rows.map(row => ({
      ...row,
      vaults: row.vaults.map(v =>
        v.id === vaultId ? { ...v, ...updates } : v
      ),
    })),
  }));
}

function addLogEntry(log: ActivityEntry[], entry: Omit<ActivityEntry, 'id' | 'timestamp'>): ActivityEntry[] {
  const newEntry: ActivityEntry = {
    ...entry,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  return [newEntry, ...log].slice(0, 200);
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function makeEmptyVault(zoneId: string, rowId: string, position: number, vaultNum: string): Vault {
  return {
    id: `${zoneId}__${rowId}__${position}`,
    vaultNum,
    customer: '',
    status: 'empty',
    flagReason: null,
    notes: '',
    zoneId,
    rowId,
    position,
  };
}

function getNextVaultNum(zones: Zone[]): number {
  let max = 0;
  for (const zone of zones) {
    for (const row of zone.rows) {
      for (const v of row.vaults) {
        const n = parseInt(v.vaultNum, 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
  }
  return max + 1;
}

function hasOccupiedVaults(zone: Zone): boolean {
  return zone.rows.some(r => r.vaults.some(v => v.customer !== '' || v.status === 'occupied'));
}

function rowHasOccupiedVaults(row: { vaults: Vault[] }): boolean {
  return row.vaults.some(v => v.customer !== '' || v.status === 'occupied');
}

function loadState(): WarehouseState {
  try {
    const saved = localStorage.getItem('vault-manager-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        zones: parsed.zones || seedZones,
        customers: seedCustomers,
        activityLog: parsed.activityLog || [],
        selectedVaultId: null,
        searchQuery: '',
        highlightedCustomer: null,
        showActivityLog: false,
        showCustomerSidebar: false,
      };
    }
  } catch {
    // ignore parse errors
  }
  return {
    zones: seedZones,
    customers: seedCustomers,
    activityLog: [],
    selectedVaultId: null,
    searchQuery: '',
    highlightedCustomer: null,
    showActivityLog: false,
    showCustomerSidebar: false,
  };
}

function saveState(state: WarehouseState) {
  try {
    localStorage.setItem('vault-manager-state', JSON.stringify({
      zones: state.zones,
      customers: state.customers,
      activityLog: state.activityLog,
    }));
  } catch {
    // ignore storage errors
  }
}

function reducer(state: WarehouseState, action: Action): WarehouseState {
  let newState: WarehouseState;

  switch (action.type) {
    case 'SELECT_VAULT':
      return { ...state, selectedVaultId: action.vaultId };

    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query };

    case 'HIGHLIGHT_CUSTOMER':
      return { ...state, highlightedCustomer: action.customer };

    case 'TOGGLE_ACTIVITY_LOG':
      return { ...state, showActivityLog: !state.showActivityLog };

    case 'TOGGLE_CUSTOMER_SIDEBAR':
      return { ...state, showCustomerSidebar: !state.showCustomerSidebar };

    case 'UPDATE_VAULT': {
      const vault = findVault(state.zones, action.vaultId);
      if (!vault) return state;
      const zones = updateVaultInZones(state.zones, action.vaultId, action.updates);
      const details: string[] = [];
      if (action.updates.customer !== undefined && action.updates.customer !== vault.customer) {
        details.push(`customer: "${vault.customer}" \u2192 "${action.updates.customer}"`);
      }
      if (action.updates.status !== undefined && action.updates.status !== vault.status) {
        details.push(`status: ${vault.status} \u2192 ${action.updates.status}`);
      }
      if (action.updates.flagReason !== undefined && action.updates.flagReason !== vault.flagReason) {
        if (action.updates.flagReason) {
          details.push(`flagged: ${FLAG_CONFIG[action.updates.flagReason].label}`);
        } else {
          details.push('flag removed');
        }
      }
      if (action.updates.notes !== undefined && action.updates.notes !== vault.notes) {
        details.push('notes updated');
      }
      const log = details.length > 0
        ? addLogEntry(state.activityLog, {
            action: 'edit',
            vaultId: vault.id,
            vaultNum: vault.vaultNum || '(no#)',
            details: details.join(', '),
            user: 'Admin',
          })
        : state.activityLog;
      newState = { ...state, zones, activityLog: log };
      saveState(newState);
      return newState;
    }

    case 'MARK_EMPTY': {
      const vault = findVault(state.zones, action.vaultId);
      if (!vault) return state;
      const zones = updateVaultInZones(state.zones, action.vaultId, {
        customer: '',
        status: 'empty' as VaultStatus,
        flagReason: null,
        claimId: undefined,
      });
      const log = addLogEntry(state.activityLog, {
        action: 'unassign',
        vaultId: vault.id,
        vaultNum: vault.vaultNum || '(no#)',
        details: `Cleared "${vault.customer}" from vault`,
        user: 'Admin',
      });
      newState = { ...state, zones, activityLog: log, selectedVaultId: null };
      saveState(newState);
      return newState;
    }

    case 'MOVE_CUSTOMER': {
      const fromVault = findVault(state.zones, action.fromVaultId);
      const toVault = findVault(state.zones, action.toVaultId);
      if (!fromVault || !toVault) return state;

      let zones = state.zones;
      let log = state.activityLog;

      if (toVault.customer && toVault.status === 'occupied') {
        zones = updateVaultInZones(zones, action.fromVaultId, {
          customer: toVault.customer, status: toVault.status,
          flagReason: toVault.flagReason, notes: toVault.notes, claimId: toVault.claimId,
        });
        zones = updateVaultInZones(zones, action.toVaultId, {
          customer: fromVault.customer, status: fromVault.status,
          flagReason: fromVault.flagReason, notes: fromVault.notes, claimId: fromVault.claimId,
        });
        log = addLogEntry(log, {
          action: 'swap', vaultId: fromVault.id, vaultNum: fromVault.vaultNum || '(no#)',
          details: `Swapped "${fromVault.customer}" (vault ${fromVault.vaultNum || '?'}) with "${toVault.customer}" (vault ${toVault.vaultNum || '?'})`,
          user: 'Admin',
        });
      } else {
        zones = updateVaultInZones(zones, action.toVaultId, {
          customer: fromVault.customer, status: 'occupied',
          flagReason: fromVault.flagReason, notes: fromVault.notes, claimId: fromVault.claimId,
        });
        zones = updateVaultInZones(zones, action.fromVaultId, {
          customer: '', status: 'empty', flagReason: null, notes: '', claimId: undefined,
        });
        log = addLogEntry(log, {
          action: 'move', vaultId: fromVault.id, vaultNum: fromVault.vaultNum || '(no#)',
          details: `Moved "${fromVault.customer}" from vault ${fromVault.vaultNum || '?'} to vault ${toVault.vaultNum || '?'}`,
          user: 'Admin',
        });
      }

      newState = { ...state, zones, activityLog: log };
      saveState(newState);
      return newState;
    }

    case 'LOG_ACTIVITY': {
      const log = addLogEntry(state.activityLog, action.entry);
      newState = { ...state, activityLog: log };
      saveState(newState);
      return newState;
    }

    // ─── Layout actions ────────────────────────────────────

    case 'ADD_ZONE': {
      const zoneId = toSlug(action.name) || `zone-${Date.now()}`;
      const rowId = `${zoneId}-row-1`;
      let nextNum = getNextVaultNum(state.zones);
      const vaults: Vault[] = [];
      for (let i = 0; i < action.vaultCount; i++) {
        vaults.push(makeEmptyVault(zoneId, rowId, i, String(nextNum++)));
      }
      const newZone: Zone = {
        id: zoneId,
        name: action.name,
        layoutHint: action.layoutHint,
        rows: [{ id: rowId, rowType: action.rowType, vaults }],
      };
      const zones = [...state.zones, newZone];
      const log = addLogEntry(state.activityLog, {
        action: 'layout', vaultId: '', vaultNum: '',
        details: `Added zone "${action.name}" with ${action.vaultCount} ${action.rowType}(s)`,
        user: 'Admin',
      });
      newState = { ...state, zones, activityLog: log };
      saveState(newState);
      return newState;
    }

    case 'REMOVE_ZONE': {
      const zone = state.zones.find(z => z.id === action.zoneId);
      if (!zone || hasOccupiedVaults(zone)) return state;
      const zones = state.zones.filter(z => z.id !== action.zoneId);
      const log = addLogEntry(state.activityLog, {
        action: 'layout', vaultId: '', vaultNum: '',
        details: `Removed zone "${zone.name}"`,
        user: 'Admin',
      });
      newState = { ...state, zones, activityLog: log };
      saveState(newState);
      return newState;
    }

    case 'RENAME_ZONE': {
      const zones = state.zones.map(z =>
        z.id === action.zoneId ? { ...z, name: action.name } : z
      );
      newState = { ...state, zones };
      saveState(newState);
      return newState;
    }

    case 'ADD_ROW': {
      let nextNum = getNextVaultNum(state.zones);
      const zones = state.zones.map(z => {
        if (z.id !== action.zoneId) return z;
        const rowId = `${z.id}-row-${z.rows.length + 1}-${Date.now()}`;
        const vaults: Vault[] = [];
        for (let i = 0; i < action.vaultCount; i++) {
          vaults.push(makeEmptyVault(z.id, rowId, i, String(nextNum++)));
        }
        return { ...z, rows: [...z.rows, { id: rowId, label: action.label, rowType: action.rowType, vaults }] };
      });
      const log = addLogEntry(state.activityLog, {
        action: 'layout', vaultId: '', vaultNum: '',
        details: `Added row of ${action.vaultCount} ${action.rowType}(s) to zone`,
        user: 'Admin',
      });
      newState = { ...state, zones, activityLog: log };
      saveState(newState);
      return newState;
    }

    case 'REMOVE_ROW': {
      const zone = state.zones.find(z => z.id === action.zoneId);
      const row = zone?.rows.find(r => r.id === action.rowId);
      if (!row || rowHasOccupiedVaults(row)) return state;
      const zones = state.zones.map(z =>
        z.id === action.zoneId
          ? { ...z, rows: z.rows.filter(r => r.id !== action.rowId) }
          : z
      );
      const log = addLogEntry(state.activityLog, {
        action: 'layout', vaultId: '', vaultNum: '',
        details: `Removed row "${row.label || row.id}" (${row.vaults.length} units)`,
        user: 'Admin',
      });
      newState = { ...state, zones, activityLog: log };
      saveState(newState);
      return newState;
    }

    case 'ADD_VAULTS': {
      let nextNum = getNextVaultNum(state.zones);
      const zones = state.zones.map(z => {
        if (z.id !== action.zoneId) return z;
        return {
          ...z,
          rows: z.rows.map(r => {
            if (r.id !== action.rowId) return r;
            const newVaults = [...r.vaults];
            for (let i = 0; i < action.count; i++) {
              const pos = newVaults.length;
              newVaults.push(makeEmptyVault(z.id, r.id, pos, String(nextNum++)));
            }
            return { ...r, vaults: newVaults };
          }),
        };
      });
      const log = addLogEntry(state.activityLog, {
        action: 'layout', vaultId: '', vaultNum: '',
        details: `Added ${action.count} unit(s) to row`,
        user: 'Admin',
      });
      newState = { ...state, zones, activityLog: log };
      saveState(newState);
      return newState;
    }

    case 'REMOVE_VAULT': {
      const vault = findVault(state.zones, action.vaultId);
      if (!vault || vault.customer || vault.status === 'occupied') return state;
      const zones = state.zones.map(z => ({
        ...z,
        rows: z.rows.map(r => ({
          ...r,
          vaults: r.vaults.filter(v => v.id !== action.vaultId),
        })),
      }));
      const log = addLogEntry(state.activityLog, {
        action: 'layout', vaultId: vault.id, vaultNum: vault.vaultNum,
        details: `Removed empty unit #${vault.vaultNum}`,
        user: 'Admin',
      });
      newState = { ...state, zones, activityLog: log };
      saveState(newState);
      return newState;
    }

    case 'REORDER_ZONES': {
      const zones = [...state.zones];
      const [moved] = zones.splice(action.fromIndex, 1);
      zones.splice(action.toIndex, 0, moved);
      newState = { ...state, zones };
      saveState(newState);
      return newState;
    }

    case 'REORDER_ROWS': {
      const zones = state.zones.map(z => {
        if (z.id !== action.zoneId) return z;
        const rows = [...z.rows];
        const [moved] = rows.splice(action.fromIndex, 1);
        rows.splice(action.toIndex, 0, moved);
        return { ...z, rows };
      });
      newState = { ...state, zones };
      saveState(newState);
      return newState;
    }

    case 'RESET_WAREHOUSE': {
      const log = addLogEntry(state.activityLog, {
        action: 'layout', vaultId: '', vaultNum: '',
        details: 'Reset warehouse to default layout',
        user: 'Admin',
      });
      newState = { ...state, zones: seedZones, activityLog: log };
      saveState(newState);
      return newState;
    }

    default:
      return state;
  }
}

interface ContextValue extends WarehouseState {
  dispatch: React.Dispatch<Action>;
  getVault: (id: string) => Vault | undefined;
  getAllVaults: () => Vault[];
  getCustomerVaultCount: (customerName: string) => number;
  resolveCustomerName: (name: string) => string;
}

const WarehouseContext = createContext<ContextValue | null>(null);

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  const getVault = useCallback((id: string) => findVault(state.zones, id), [state.zones]);

  const getAllVaults = useCallback(() => {
    const vaults: Vault[] = [];
    for (const zone of state.zones) {
      for (const row of zone.rows) {
        vaults.push(...row.vaults);
      }
    }
    return vaults;
  }, [state.zones]);

  const resolveCustomerName = useCallback((name: string): string => {
    if (!name) return '';
    const lower = name.toLowerCase();
    for (const c of state.customers) {
      if (c.name.toLowerCase() === lower) return c.name;
      for (const alias of c.aliases) {
        if (alias.toLowerCase() === lower) return c.name;
      }
    }
    return name;
  }, [state.customers]);

  const getCustomerVaultCount = useCallback((customerName: string): number => {
    const resolved = resolveCustomerName(customerName);
    let count = 0;
    for (const zone of state.zones) {
      for (const row of zone.rows) {
        for (const v of row.vaults) {
          if (v.customer && resolveCustomerName(v.customer) === resolved) {
            count++;
          }
        }
      }
    }
    return count;
  }, [state.zones, resolveCustomerName]);

  return (
    <WarehouseContext.Provider value={{
      ...state,
      dispatch,
      getVault,
      getAllVaults,
      getCustomerVaultCount,
      resolveCustomerName,
    }}>
      {children}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse() {
  const ctx = useContext(WarehouseContext);
  if (!ctx) throw new Error('useWarehouse must be used within WarehouseProvider');
  return ctx;
}
