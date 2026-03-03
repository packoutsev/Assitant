import { useState, useCallback } from 'react';
import type { BudgetLineItem, BudgetCategory } from '../types';
import { ChevronDown, ChevronRight, DollarSign, Edit3, Check, X } from 'lucide-react';

interface BudgetViewProps {
  budget: BudgetLineItem[];
  onUpdateBudgetActual: (item: BudgetLineItem, actual: number) => void;
}

const categoryConfig: Record<BudgetCategory, { label: string; color: string; bg: string }> = {
  Labor: { label: 'Labor', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  Materials: { label: 'Materials', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  Contingency: { label: 'Contingency', color: 'text-slate-light', bg: 'bg-gray-50 border-gray-200' },
};

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function sumField(items: BudgetLineItem[], field: 'estimateLow' | 'estimateHigh' | 'actual'): number {
  return items.reduce((sum, i) => sum + i[field], 0);
}

export function BudgetView({ budget, onUpdateBudgetActual }: BudgetViewProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ Labor: true, Materials: true, Contingency: true });
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const toggle = useCallback((cat: string) => {
    setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const startEdit = useCallback((item: BudgetLineItem) => {
    setEditingRow(item._row);
    setEditValue(item.actual > 0 ? String(item.actual) : '');
  }, []);

  const saveEdit = useCallback((item: BudgetLineItem) => {
    const val = parseFloat(editValue) || 0;
    onUpdateBudgetActual(item, val);
    setEditingRow(null);
    setEditValue('');
  }, [editValue, onUpdateBudgetActual]);

  const cancelEdit = useCallback(() => {
    setEditingRow(null);
    setEditValue('');
  }, []);

  const categories: BudgetCategory[] = ['Labor', 'Materials', 'Contingency'];

  const totalLow = sumField(budget, 'estimateLow');
  const totalHigh = sumField(budget, 'estimateHigh');
  const totalActual = sumField(budget, 'actual');
  const totalMid = Math.round((totalLow + totalHigh) / 2);
  const spentPct = totalMid > 0 ? Math.round((totalActual / totalMid) * 100) : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary Card */}
      <div className="bg-white rounded-lg border border-warm-dark p-4">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={20} className="text-copper" />
          <h1 className="text-lg font-bold text-slate-dark">Project Budget</h1>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center">
            <p className="text-[10px] text-slate-light uppercase tracking-wide">Estimate Range</p>
            <p className="text-sm font-bold text-slate-dark">{fmt(totalLow)} – {fmt(totalHigh)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-light uppercase tracking-wide">Midpoint</p>
            <p className="text-lg font-bold text-copper">{fmt(totalMid)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-light uppercase tracking-wide">Spent</p>
            <p className={`text-sm font-bold ${totalActual > totalHigh ? 'text-red-600' : totalActual > totalMid ? 'text-amber-600' : 'text-sage'}`}>
              {fmt(totalActual)}
            </p>
          </div>
        </div>

        {/* Spend progress bar */}
        <div className="w-full bg-warm-dark rounded-full h-2.5 relative">
          {/* Midpoint marker */}
          <div className="absolute top-0 h-2.5 border-r-2 border-copper/40" style={{ left: '50%' }} />
          <div
            className={`h-2.5 rounded-full transition-all ${totalActual > totalHigh ? 'bg-red-500' : totalActual > totalMid ? 'bg-amber-400' : 'bg-sage'}`}
            style={{ width: `${Math.min(spentPct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-slate-light">{fmt(totalLow)}</span>
          <span className="text-[10px] text-slate-light">{spentPct}% of midpoint</span>
          <span className="text-[10px] text-slate-light">{fmt(totalHigh)}</span>
        </div>
      </div>

      {/* Category Breakdown */}
      {categories.map(cat => {
        const items = budget.filter(b => b.category === cat);
        if (items.length === 0) return null;
        const config = categoryConfig[cat];
        const catLow = sumField(items, 'estimateLow');
        const catHigh = sumField(items, 'estimateHigh');
        const catActual = sumField(items, 'actual');
        const isOpen = expanded[cat];

        return (
          <div key={cat} className={`rounded-lg border ${config.bg}`}>
            <button
              onClick={() => toggle(cat)}
              className="flex items-center justify-between w-full p-3"
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown size={16} className="text-slate-light" /> : <ChevronRight size={16} className="text-slate-light" />}
                <h2 className={`text-sm font-semibold ${config.color}`}>{config.label}</h2>
                <span className="text-[10px] text-slate-light">{items.length} items</span>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-dark">{fmt(catLow)} – {fmt(catHigh)}</p>
                {catActual > 0 && (
                  <p className="text-[10px] text-sage">Spent: {fmt(catActual)}</p>
                )}
              </div>
            </button>

            {isOpen && (
              <div className="px-3 pb-3 space-y-2">
                {items.map(item => (
                  <div key={item._row} className="bg-white/70 rounded-md p-2.5 border border-white/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {item.trade && (
                            <span className="text-[10px] font-medium text-copper bg-copper/10 px-1.5 py-0.5 rounded">{item.trade}</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-dark mt-1">{item.description}</p>
                        {item.notes && (
                          <p className="text-[10px] text-slate-light mt-0.5">{item.notes}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-light">
                          Est: {fmt(item.estimateLow)} – {fmt(item.estimateHigh)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {editingRow === item._row ? (
                          <>
                            <span className="text-[10px] text-slate-light">$</span>
                            <input
                              type="number"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveEdit(item);
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              className="w-20 text-xs border border-copper rounded px-1.5 py-0.5 text-right"
                              autoFocus
                              placeholder="0"
                            />
                            <button onClick={() => saveEdit(item)} className="text-sage p-0.5"><Check size={14} /></button>
                            <button onClick={cancelEdit} className="text-red-400 p-0.5"><X size={14} /></button>
                          </>
                        ) : (
                          <button
                            onClick={() => startEdit(item)}
                            className="flex items-center gap-1 text-[10px] text-slate-light hover:text-copper"
                          >
                            {item.actual > 0 ? (
                              <span className={`font-medium ${item.actual > item.estimateHigh ? 'text-red-600' : 'text-sage'}`}>
                                Actual: {fmt(item.actual)}
                              </span>
                            ) : (
                              <span>Add actual</span>
                            )}
                            <Edit3 size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Trade Summary */}
      <div className="bg-white rounded-lg border border-warm-dark p-4">
        <h2 className="text-sm font-semibold text-slate-dark mb-3">Trade Allocation</h2>
        <p className="text-[10px] text-slate-light mb-3">
          You GC (source, schedule, coordinate). Carpenter does all hands-on work: demo, framing, plumbing, electrical, brick cut, drywall,
          all doors, PAX, limewash, painting, blinds, trim, hardware. Sub out tile installer + glass company only.
        </p>
        <div className="space-y-1.5">
          {budget.filter(b => b.category === 'Labor').map(item => {
            const mid = Math.round((item.estimateLow + item.estimateHigh) / 2);
            const pct = totalMid > 0 ? Math.round((mid / totalMid) * 100) : 0;
            return (
              <div key={item._row} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-dark w-28 truncate">{item.trade}</span>
                <div className="flex-1 bg-warm-dark rounded-full h-1.5">
                  <div className="bg-copper/60 h-1.5 rounded-full" style={{ width: `${pct * 3}%` }} />
                </div>
                <span className="text-[10px] text-slate-light w-16 text-right">{fmt(mid)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
