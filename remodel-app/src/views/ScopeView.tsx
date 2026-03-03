import { useState } from 'react';
import { ScopeCard } from '../components/ScopeCard';
import type { ScopeItem, TaskStatus, Zone } from '../types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ScopeViewProps {
  scope: ScopeItem[];
  onStatusChange: (item: ScopeItem, newStatus: TaskStatus) => void;
}

const zones: Zone[] = ['Primary Bedroom', 'Primary Hallway', 'Primary Bathroom'];

export function ScopeView({ scope, onStatusChange }: ScopeViewProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleZone(zone: string) {
    setCollapsed(prev => ({ ...prev, [zone]: !prev[zone] }));
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-lg font-bold text-slate-dark">Scope of Work</h1>

      {zones.map(zone => {
        const items = scope.filter(s => s.zone === zone);
        const done = items.filter(s => s.status === 'Done').length;
        const isCollapsed = collapsed[zone];
        const shortName = zone.replace('Primary ', '');

        return (
          <div key={zone} className="bg-white rounded-lg border border-warm-dark overflow-hidden">
            <button
              onClick={() => toggleZone(zone)}
              className="w-full flex items-center justify-between p-4 hover:bg-warm-dark/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? <ChevronRight size={16} className="text-slate-light" /> : <ChevronDown size={16} className="text-slate-light" />}
                <h2 className="text-sm font-semibold text-slate-dark">{shortName}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-light">{done}/{items.length}</span>
                <div className="w-16 bg-warm-dark rounded-full h-1.5">
                  <div className="bg-copper h-1.5 rounded-full transition-all" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
                </div>
              </div>
            </button>
            {!isCollapsed && (
              <div className="px-4 pb-4 space-y-2">
                {items.map((item, i) => (
                  <ScopeCard key={i} item={item} onStatusChange={onStatusChange} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
