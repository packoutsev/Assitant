import type { ScopeItem, TaskStatus } from '../types';
import { StatusBadge } from './StatusBadge';

interface ScopeCardProps {
  item: ScopeItem;
  onStatusChange: (item: ScopeItem, newStatus: TaskStatus) => void;
}

const statusCycle: TaskStatus[] = ['Not Started', 'In Progress', 'Done'];

export function ScopeCard({ item, onStatusChange }: ScopeCardProps) {
  function cycleStatus() {
    const currentIdx = statusCycle.indexOf(item.status);
    const nextIdx = (currentIdx + 1) % statusCycle.length;
    onStatusChange(item, statusCycle[nextIdx]);
  }

  return (
    <div
      onClick={cycleStatus}
      className={`flex items-start justify-between gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
        item.status === 'Done'
          ? 'bg-sage-light/30 border-sage/20 opacity-70'
          : item.status === 'In Progress'
          ? 'bg-blue-50/30 border-blue-200'
          : 'bg-white border-warm-dark hover:border-copper/30'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${item.status === 'Done' ? 'line-through text-gray-400' : 'text-slate-dark'}`}>
          {item.lineItem}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-slate-light">{item.trade}</span>
          {item.category && (
            <>
              <span className="text-[11px] text-slate-light/40">·</span>
              <span className="text-[11px] text-slate-light">{item.category}</span>
            </>
          )}
        </div>
        {item.notes && (
          <p className="text-[11px] text-slate-light/70 mt-1">{item.notes}</p>
        )}
      </div>
      <StatusBadge status={item.status} small />
    </div>
  );
}
