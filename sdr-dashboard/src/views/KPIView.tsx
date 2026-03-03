import { useMemo, useState } from 'react';
import { Target, Flame, Activity, Edit3, Check, X } from 'lucide-react';
import type { KPIRow } from '../types';

interface KPIViewProps {
  kpis: KPIRow[];
  onUpdateActual: (kpi: KPIRow, weekNum: number, value: string) => void;
}

function getCurrentWeekNum(): number {
  const start = new Date(2026, 2, 9);
  const now = new Date();
  const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 1;
  if (diff < 5) return 1;
  if (diff < 12) return 2;
  if (diff < 19) return 3;
  return 4;
}

const sectionIcons: Record<string, typeof Target> = {
  'PRIMARY KPIs': Target,
  'FIRE LEAD KPIs': Flame,
  'ACTIVITY KPIs': Activity,
};

const sectionColors: Record<string, { bg: string; border: string; icon: string }> = {
  'PRIMARY KPIs': { bg: 'bg-navy/5', border: 'border-navy/20', icon: 'text-navy' },
  'FIRE LEAD KPIs': { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-500' },
  'ACTIVITY KPIs': { bg: 'bg-amber/5', border: 'border-amber/30', icon: 'text-amber' },
};

function EditableCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="group flex items-center gap-1 text-sm text-gray-600 hover:text-navy min-w-[60px]"
        title="Click to edit"
      >
        <span>{value || '—'}</span>
        <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-50 shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(draft); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-20 px-2 py-1 text-sm border border-navy/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber/50"
      />
      <button onClick={() => { onSave(draft); setEditing(false); }} className="text-emerald-500 hover:text-emerald-700">
        <Check className="w-4 h-4" />
      </button>
      <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function KPIView({ kpis, onUpdateActual }: KPIViewProps) {
  const currentWeek = getCurrentWeekNum();

  const sections = useMemo(() => {
    const grouped: Record<string, KPIRow[]> = {};
    for (const kpi of kpis) {
      const section = kpi._section || 'Other';
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push(kpi);
    }
    return grouped;
  }, [kpis]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">KPI Dashboard</h1>
        <span className="text-sm bg-navy text-white px-3 py-1 rounded-full font-medium">
          Week {currentWeek}
        </span>
      </div>

      {/* Hero metric: Meaningful Conversations */}
      {kpis.length > 0 && (
        <div className="bg-gradient-to-r from-navy to-navy-light rounded-2xl p-6 text-white mb-6">
          <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Primary Metric</p>
          <h2 className="text-lg font-bold mb-4">Meaningful Conversations / Day</h2>
          <div className="flex items-end gap-4">
            {[1, 2, 3, 4].map(w => {
              const kpi = kpis.find(k => k.Metric === 'Meaningful Conversations / Day');
              const target = kpi?.[`Week ${w} Target` as keyof KPIRow] as string || '';
              const actual = kpi?.[`Week ${w} Actual` as keyof KPIRow] as string || '';
              const isActive = w === currentWeek;
              return (
                <div key={w} className={`flex-1 text-center ${isActive ? '' : 'opacity-50'}`}>
                  <p className="text-3xl font-bold text-amber">{actual || '—'}</p>
                  <p className="text-xs text-white/40 mt-1">Target: {target}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">Week {w}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI sections */}
      <div className="space-y-6">
        {Object.entries(sections).map(([sectionName, sectionKpis]) => {
          const Icon = sectionIcons[sectionName] || Target;
          const colors = sectionColors[sectionName] || sectionColors['ACTIVITY KPIs'];

          return (
            <div key={sectionName} className={`rounded-2xl border ${colors.border} ${colors.bg} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-gray-200/50 flex items-center gap-2">
                <Icon className={`w-4 h-4 ${colors.icon}`} />
                <h2 className="font-bold text-sm text-gray-700">{sectionName}</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wider">
                      <th className="text-left px-5 py-3 font-medium">Metric</th>
                      {[1, 2, 3, 4].map(w => (
                        <th key={w} className={`text-center px-3 py-3 font-medium ${w === currentWeek ? 'text-navy' : ''}`}>
                          {w === currentWeek && <span className="block text-amber text-[10px] mb-0.5">CURRENT</span>}
                          Wk {w}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sectionKpis.map((kpi) => (
                      <tr key={kpi._row} className="border-t border-gray-200/30">
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-700">{kpi.Metric}</p>
                          {kpi.Notes && <p className="text-[11px] text-gray-400 mt-0.5">{kpi.Notes}</p>}
                        </td>
                        {[1, 2, 3, 4].map(w => {
                          const targetKey = `Week ${w} Target` as keyof KPIRow;
                          const target = (kpi[targetKey] as string) || '';
                          return (
                            <td key={w} className={`px-3 py-3 text-center ${w === currentWeek ? 'bg-white/50' : ''}`}>
                              <p className="text-xs text-gray-400 mb-1">{target}</p>
                              <EditableCell
                                value={(kpi[`Week ${w} Actual` as keyof KPIRow] as string) || ''}
                                onSave={(val) => onUpdateActual(kpi, w, val)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
