import { useMemo } from 'react';
import { CheckCircle2, Circle, Calendar } from 'lucide-react';
import type { TrainingModule } from '../types';
import ProgressRing from '../components/ProgressRing';

interface TrainingViewProps {
  modules: TrainingModule[];
  onToggleComplete: (mod: TrainingModule, completed: string) => void;
}

const categoryOrder = ['Industry Education', 'Sagan Async', 'Sagan Live', 'Event Library', 'Playbook', 'Role-Play'];

const categoryStyles: Record<string, { bg: string; accent: string }> = {
  'Industry Education': { bg: 'bg-orange-50', accent: 'text-orange-600' },
  'Sagan Async': { bg: 'bg-purple-50', accent: 'text-purple-600' },
  'Sagan Live': { bg: 'bg-purple-100', accent: 'text-purple-700' },
  'Event Library': { bg: 'bg-indigo-50', accent: 'text-indigo-600' },
  'Playbook': { bg: 'bg-blue-50', accent: 'text-blue-600' },
  'Role-Play': { bg: 'bg-pink-50', accent: 'text-pink-600' },
};

function isCompleted(mod: TrainingModule): boolean {
  const v = mod.Completed?.toLowerCase().trim();
  return v === 'yes' || v === 'done' || v === '✓' || v === 'x' || v === 'true';
}

export default function TrainingView({ modules, onToggleComplete }: TrainingViewProps) {
  const grouped = useMemo(() => {
    const groups: Record<string, TrainingModule[]> = {};
    for (const mod of modules) {
      const cat = mod.Category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(mod);
    }
    // Sort by predefined order
    const sorted: [string, TrainingModule[]][] = [];
    for (const cat of categoryOrder) {
      if (groups[cat]) sorted.push([cat, groups[cat]]);
    }
    for (const [cat, mods] of Object.entries(groups)) {
      if (!categoryOrder.includes(cat)) sorted.push([cat, mods]);
    }
    return sorted;
  }, [modules]);

  const totalDone = modules.filter(isCompleted).length;
  const totalModules = modules.length;

  // Find next upcoming live session
  const nextLive = modules.find(m => m.Category === 'Sagan Live' && !isCompleted(m));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Training Tracker</h1>

      {/* Summary row */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-5">
          <ProgressRing percent={totalModules > 0 ? (totalDone / totalModules) * 100 : 0} size={80} strokeWidth={6} />
          <div>
            <p className="text-2xl font-bold text-gray-800">{totalDone}<span className="text-gray-400 text-lg">/{totalModules}</span></p>
            <p className="text-sm text-gray-500">modules completed</p>
          </div>
        </div>

        {nextLive && (
          <div className="flex-1 bg-purple-50 rounded-2xl border border-purple-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-purple-500" />
              <p className="text-xs text-purple-500 uppercase tracking-wider font-semibold">Next Live Session</p>
            </div>
            <p className="font-bold text-purple-800 text-sm">{nextLive.Module}</p>
            <p className="text-xs text-purple-500 mt-1">{nextLive['Due By']} — 7:30 AM AZ time</p>
          </div>
        )}
      </div>

      {/* Grouped modules */}
      <div className="space-y-4">
        {grouped.map(([category, mods]) => {
          const catDone = mods.filter(isCompleted).length;
          const catPercent = mods.length > 0 ? (catDone / mods.length) * 100 : 0;
          const styles = categoryStyles[category] || { bg: 'bg-gray-50', accent: 'text-gray-600' };

          return (
            <div key={category} className={`rounded-2xl border border-gray-200 overflow-hidden`}>
              {/* Category header */}
              <div className={`${styles.bg} px-5 py-3 flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <h2 className={`font-bold text-sm ${styles.accent}`}>{category}</h2>
                  <span className="text-xs text-gray-400">{catDone}/{mods.length}</span>
                </div>
                <div className="w-24 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${catPercent >= 100 ? 'bg-emerald-500' : 'bg-amber'}`}
                    style={{ width: `${catPercent}%` }}
                  />
                </div>
              </div>

              {/* Module list */}
              <div className="bg-white divide-y divide-gray-100">
                {mods.map((mod) => {
                  const done = isCompleted(mod);
                  return (
                    <div key={mod._row} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <button
                        onClick={() => onToggleComplete(mod, done ? '' : 'Done')}
                        className="shrink-0"
                      >
                        {done ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <Circle className="w-5 h-5 text-gray-300 hover:text-navy transition-colors" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {mod.Module}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-gray-400">{mod.Source}</span>
                          {mod['Due By'] && (
                            <span className="text-[10px] text-gray-400">Due: {mod['Due By']}</span>
                          )}
                        </div>
                      </div>
                      {mod['Score / Notes'] && (
                        <span className="text-[10px] text-gray-400 hidden sm:block max-w-[200px] truncate">
                          {mod['Score / Notes']}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
