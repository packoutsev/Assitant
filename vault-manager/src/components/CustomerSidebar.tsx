import { X, Users, ChevronRight } from 'lucide-react';
import { useWarehouse } from '../contexts/WarehouseContext';
import { FLAG_CONFIG } from '../types';
import type { FlagReason } from '../types';

export default function CustomerSidebar() {
  const {
    showCustomerSidebar,
    customers,
    highlightedCustomer,
    getAllVaults,
    resolveCustomerName,
    dispatch,
  } = useWarehouse();

  if (!showCustomerSidebar) return null;

  const allVaults = getAllVaults();

  // Build customer summary
  const customerMap = new Map<string, { count: number; vaultNums: string[]; hasFlag: boolean; worstFlag: string | null }>();
  for (const v of allVaults) {
    if (!v.customer) continue;
    const resolved = resolveCustomerName(v.customer);
    const existing = customerMap.get(resolved) || { count: 0, vaultNums: [], hasFlag: false, worstFlag: null };
    existing.count++;
    if (v.vaultNum) existing.vaultNums.push(v.vaultNum);
    if (v.flagReason) {
      existing.hasFlag = true;
      // Escalated > past-due > mold > verify > other
      const priority = ['ar-escalated', 'ar-past-due', 'mold-hazard', 'needs-verify', 'other'];
      const currentIdx = existing.worstFlag ? priority.indexOf(existing.worstFlag) : 999;
      const newIdx = priority.indexOf(v.flagReason);
      if (newIdx < currentIdx) existing.worstFlag = v.flagReason;
    }
    customerMap.set(resolved, existing);
  }

  const sorted = [...customerMap.entries()].sort((a, b) => b[1].count - a[1].count);

  const totalOccupied = allVaults.filter(v => v.status !== 'empty').length;
  const totalEmpty = allVaults.filter(v => v.status === 'empty').length;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-30 lg:hidden"
        onClick={() => dispatch({ type: 'TOGGLE_CUSTOMER_SIDEBAR' })}
      />
      <div className="fixed left-0 top-0 bottom-0 w-full max-w-xs bg-gray-900 border-r border-gray-700 z-40 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-bold text-gray-100">Customers</h2>
          </div>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_CUSTOMER_SIDEBAR' })}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-4 px-4 py-3 border-b border-gray-800 text-xs">
          <div>
            <span className="text-gray-500">Occupied</span>
            <span className="ml-1 font-mono font-bold text-blue-400">{totalOccupied}</span>
          </div>
          <div>
            <span className="text-gray-500">Empty</span>
            <span className="ml-1 font-mono font-bold text-green-400">{totalEmpty}</span>
          </div>
          <div>
            <span className="text-gray-500">Customers</span>
            <span className="ml-1 font-mono font-bold text-gray-300">{customerMap.size}</span>
          </div>
        </div>

        {/* Customer list */}
        <div className="flex-1 overflow-y-auto">
          {highlightedCustomer && (
            <button
              onClick={() => dispatch({ type: 'HIGHLIGHT_CUSTOMER', customer: null })}
              className="w-full px-4 py-2 text-xs text-yellow-400 bg-yellow-900/20 hover:bg-yellow-900/30 text-left"
            >
              Clear highlight
            </button>
          )}
          {sorted.map(([name, data]) => (
            <button
              key={name}
              onClick={() => dispatch({
                type: 'HIGHLIGHT_CUSTOMER',
                customer: highlightedCustomer === name ? null : name,
              })}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-800/50
                hover:bg-gray-800/50 transition-colors
                ${highlightedCustomer === name ? 'bg-yellow-900/20 border-l-2 border-l-yellow-400' : ''}
              `}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200 truncate">{name}</span>
                  {data.worstFlag && (
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: FLAG_CONFIG[data.worstFlag as FlagReason].dotColor }}
                      title={FLAG_CONFIG[data.worstFlag as FlagReason].label}
                    />
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {data.count} vault{data.count !== 1 ? 's' : ''}
                  {data.vaultNums.length > 0 && (
                    <span className="ml-1 font-mono">
                      ({data.vaultNums.slice(0, 5).join(', ')}{data.vaultNums.length > 5 ? '...' : ''})
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
            </button>
          ))}
        </div>

        {/* Unassigned customers */}
        {customers.filter(c => !customerMap.has(c.name)).length > 0 && (
          <div className="border-t border-gray-700 px-4 py-3">
            <p className="text-xs text-gray-500 mb-2">No vaults assigned:</p>
            <div className="flex flex-wrap gap-1">
              {customers.filter(c => !customerMap.has(c.name)).map(c => (
                <span key={c.name} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
