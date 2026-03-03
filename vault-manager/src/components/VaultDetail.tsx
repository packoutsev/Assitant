import { useState, useEffect, useMemo } from 'react';
import { X, Trash2, Save, CalendarClock, DollarSign, AlertTriangle, Package } from 'lucide-react';
import { useWarehouse } from '../contexts/WarehouseContext';
import type { VaultStatus, FlagReason } from '../types';
import { FLAG_CONFIG } from '../types';
import VaultInventory from './VaultInventory';
import QRScanner from './QRScanner';

const FLAG_OPTIONS: { value: FlagReason | ''; label: string }[] = [
  { value: '', label: 'No flag' },
  { value: 'ar-past-due', label: 'A/R Past Due' },
  { value: 'ar-escalated', label: 'A/R Escalated' },
  { value: 'mold-hazard', label: 'Mold / Hazard' },
  { value: 'needs-verify', label: 'Needs Verification' },
  { value: 'other', label: 'Other' },
];

function BillingSection({ vault }: { vault: { dateReceived?: string; billedThrough?: string; datePastDue?: string; storagePending?: string } }) {
  if (!vault.dateReceived && !vault.billedThrough && !vault.datePastDue && !vault.storagePending) {
    return null;
  }

  const today = new Date();
  const isPastDue = vault.datePastDue ? new Date(vault.datePastDue) < today : false;

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 border-b border-gray-700">
        <CalendarClock className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-300">Storage Billing</span>
        {isPastDue && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-orange-400">
            <AlertTriangle className="w-3 h-3" />
            PAST DUE
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2.5 text-xs">
        {vault.dateReceived && (
          <div>
            <span className="text-gray-500">Received</span>
            <div className="text-gray-200 font-mono">{vault.dateReceived}</div>
          </div>
        )}
        {vault.billedThrough && (
          <div>
            <span className="text-gray-500">Billed Through</span>
            <div className="text-gray-200 font-mono">{vault.billedThrough}</div>
          </div>
        )}
        {vault.datePastDue && (
          <div>
            <span className="text-gray-500">Past Due Date</span>
            <div className={`font-mono ${isPastDue ? 'text-orange-400 font-bold' : 'text-gray-200'}`}>
              {vault.datePastDue}
            </div>
          </div>
        )}
        {vault.storagePending && (
          <div>
            <span className="text-gray-500">Pending Balance</span>
            <div className="flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-orange-400" />
              <span className="text-orange-400 font-mono font-bold">{vault.storagePending}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerARSection({ customerName, customers }: { customerName: string; customers: { name: string; arBalance?: number; arStatus?: string }[] }) {
  const customer = customers.find(c => c.name === customerName);
  if (!customer?.arBalance) return null;

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 border-b border-gray-700">
        <DollarSign className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-300">A/R Status</span>
        <span className="ml-auto text-xs font-mono font-bold text-orange-400">
          ${customer.arBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </span>
      </div>
      {customer.arStatus && (
        <div className="px-3 py-2 text-xs text-gray-400">
          {customer.arStatus}
        </div>
      )}
    </div>
  );
}

function VaultContentsSection({ customerName, vaultNum, allVaults }: {
  customerName: string;
  vaultNum: string;
  allVaults: { vaultNum: string; customer: string }[];
}) {
  // Show all vaults belonging to this customer
  const customerVaults = useMemo(() => {
    if (!customerName) return [];
    return allVaults
      .filter(v => v.customer === customerName && v.vaultNum)
      .map(v => v.vaultNum);
  }, [customerName, allVaults]);

  if (!customerName || customerVaults.length === 0) return null;

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 border-b border-gray-700">
        <Package className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-300">
          Customer Vaults ({customerVaults.length})
        </span>
      </div>
      <div className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {customerVaults.map(num => (
            <span
              key={num}
              className={`px-2 py-0.5 rounded text-xs font-mono ${
                num === vaultNum
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-gray-800 text-gray-400'
              }`}
            >
              #{num}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function VaultDetail() {
  const { selectedVaultId, getVault, getAllVaults, customers, dispatch } = useWarehouse();
  const vault = selectedVaultId ? getVault(selectedVaultId) : null;

  const [customer, setCustomer] = useState('');
  const [status, setStatus] = useState<VaultStatus>('empty');
  const [flagReason, setFlagReason] = useState<FlagReason | ''>('');
  const [notes, setNotes] = useState('');
  const [claimId, setClaimId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const allVaults = getAllVaults();

  useEffect(() => {
    if (vault) {
      setCustomer(vault.customer);
      setStatus(vault.status);
      setFlagReason(vault.flagReason || '');
      setNotes(vault.notes);
      setClaimId(vault.claimId || '');
      setDirty(false);
    }
  }, [vault]);

  if (!vault) return null;

  const handleSave = () => {
    dispatch({
      type: 'UPDATE_VAULT',
      vaultId: vault.id,
      updates: {
        customer,
        status: customer ? (status === 'empty' ? 'occupied' : status) : 'empty',
        flagReason: flagReason || null,
        notes,
        claimId: claimId || undefined,
      },
    });
    setDirty(false);
    dispatch({ type: 'SELECT_VAULT', vaultId: null });
  };

  const handleMarkEmpty = () => {
    if (window.confirm(`Clear "${vault.customer}" from vault ${vault.vaultNum || '(no#)'}?`)) {
      dispatch({ type: 'MARK_EMPTY', vaultId: vault.id });
    }
  };

  const handleClose = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    dispatch({ type: 'SELECT_VAULT', vaultId: null });
  };

  const change = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  const allCustomerNames = customers.map(c => c.name).sort();

  const currentFlag = flagReason ? FLAG_CONFIG[flagReason] : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-gray-900 border-l border-gray-700 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-100">
                Vault {vault.vaultNum || '(no number)'}
              </h2>
              {currentFlag && (
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: currentFlag.dotColor }}
                  title={currentFlag.label}
                />
              )}
            </div>
            <p className="text-xs text-gray-400">
              {vault.zoneId.replace(/-/g, ' ')} &middot; pos {vault.position}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form + Info */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Billing Info (read-only) */}
          <BillingSection vault={vault} />

          {/* A/R Status (read-only) */}
          {vault.customer && (
            <CustomerARSection customerName={vault.customer} customers={customers} />
          )}

          {/* All vaults for this customer (read-only) */}
          <VaultContentsSection
            customerName={vault.customer}
            vaultNum={vault.vaultNum}
            allVaults={allVaults}
          />

          {/* Vault Contents (boxes/TAGs) */}
          <VaultInventory
            vaultId={vault.id}
            vaultNum={vault.vaultNum}
            onScan={() => setShowScanner(true)}
          />

          {/* Customer */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Customer</label>
            <input
              type="text"
              list="customer-list"
              value={customer}
              onChange={e => change(setCustomer)(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100
                         focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Customer name..."
            />
            <datalist id="customer-list">
              {allCustomerNames.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Status</label>
            <select
              value={status}
              onChange={e => change(setStatus)(e.target.value as VaultStatus)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100
                         focus:outline-none focus:border-blue-500"
            >
              <option value="occupied">Occupied</option>
              <option value="empty">Empty</option>
              <option value="pallet">Pallet</option>
              <option value="mold">Mold / Quarantine</option>
            </select>
          </div>

          {/* Flag Reason */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Flag</label>
            <div className="space-y-1">
              {FLAG_OPTIONS.map(opt => {
                const isActive = flagReason === opt.value;
                const cfg = opt.value ? FLAG_CONFIG[opt.value] : null;
                return (
                  <button
                    key={opt.value}
                    onClick={() => change(setFlagReason)(opt.value as FlagReason | '')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm text-left transition-colors
                      ${isActive
                        ? (cfg ? cfg.bgColor + ' border ' : 'bg-gray-800 border border-gray-600 ')
                        : 'hover:bg-gray-800/50 border border-transparent'
                      }`}
                    style={isActive && cfg ? { borderColor: cfg.dotColor + '60' } : undefined}
                  >
                    {cfg ? (
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cfg.dotColor, opacity: isActive ? 1 : 0.4 }}
                      />
                    ) : (
                      <div className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-600" />
                    )}
                    <span className={isActive ? (cfg?.color || 'text-gray-300') : 'text-gray-500'}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Claim ID */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Claim ID</label>
            <input
              type="text"
              value={claimId}
              onChange={e => change(setClaimId)(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100
                         focus:outline-none focus:border-blue-500"
              placeholder="e.g. 25-91-C"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => change(setNotes)(e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100
                         focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Notes..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-700 p-4 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!dirty}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded font-medium text-sm
                         bg-blue-600 hover:bg-blue-500 text-white
                         disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2.5 rounded font-medium text-sm
                         bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600"
            >
              Cancel
            </button>
          </div>
          {vault.customer && (
            <button
              onClick={handleMarkEmpty}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded font-medium text-sm
                         text-red-400 hover:bg-red-900/30 border border-red-900/50"
            >
              <Trash2 className="w-4 h-4" />
              Mark Empty
            </button>
          )}
        </div>
      </div>

      {/* QR Scanner overlay */}
      {showScanner && (
        <QRScanner
          vaultId={vault.id}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}
