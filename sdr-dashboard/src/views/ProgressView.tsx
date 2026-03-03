import { useMemo } from 'react';
import { Trophy, Flame, Phone, Zap } from 'lucide-react';
import type { DailyTask, TrainingModule } from '../types';
import ProgressRing from '../components/ProgressRing';

interface ProgressViewProps {
  tasks: DailyTask[];
  training: TrainingModule[];
}

const weeks = [
  { num: 1, label: 'Foundation', dates: 'Mar 9-13', phase: 'Week 1' },
  { num: 2, label: 'Guided Practice', dates: 'Mar 16-20', phase: 'Week 2' },
  { num: 3, label: 'Ramp', dates: 'Mar 23-27', phase: 'Week 3' },
  { num: 4, label: 'Full Production', dates: 'Mar 30 – Apr 3', phase: 'Week 4' },
];

const milestones = [
  { day: 'Day 3', label: 'First live calls', icon: Phone, phase: 'Week 1' },
  { day: 'Week 2', label: 'All 5 scripts certified', icon: Trophy, phase: 'Week 2' },
  { day: 'Week 3', label: 'Independent fire leads', icon: Flame, phase: 'Week 3' },
  { day: 'Week 4', label: 'Full production — 13 convos/day', icon: Zap, phase: 'Week 4' },
];

function getCurrentWeek(): number {
  const start = new Date(2026, 2, 9);
  const now = new Date();
  const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 0;
  if (diff < 5) return 1;
  if (diff < 12) return 2;
  if (diff < 19) return 3;
  return 4;
}

export default function ProgressView({ tasks, training }: ProgressViewProps) {
  const currentWeek = getCurrentWeek();

  const weekStats = useMemo(() => {
    return weeks.map(w => {
      const weekTasks = tasks.filter(t => t.Phase === w.phase);
      const done = weekTasks.filter(t => t.Status === 'Done').length;
      const total = weekTasks.length;
      return { ...w, done, total, percent: total > 0 ? (done / total) * 100 : 0 };
    });
  }, [tasks]);

  const overallDone = tasks.filter(t => t.Status === 'Done').length;
  const overallTotal = tasks.length;
  const overallPercent = overallTotal > 0 ? (overallDone / overallTotal) * 100 : 0;

  const trainingDone = training.filter(t => t.Completed?.toLowerCase() === 'yes' || t.Completed?.toLowerCase() === 'done' || t.Completed === '✓').length;
  const trainingTotal = training.length;
  const trainingPercent = trainingTotal > 0 ? (trainingDone / trainingTotal) * 100 : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Progress Overview</h1>

      {/* Overall progress */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-8 justify-center">
          <ProgressRing percent={overallPercent} size={140} label="Tasks" sublabel={`${overallDone}/${overallTotal}`} />
          <ProgressRing percent={trainingPercent} size={140} label="Training" sublabel={`${trainingDone}/${trainingTotal}`} />
        </div>
      </div>

      {/* Week-by-week */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {weekStats.map((w) => {
          const isCurrent = w.num === currentWeek;
          const isPast = w.num < currentWeek;
          return (
            <div
              key={w.num}
              className={`rounded-xl border p-4 transition-all ${
                isCurrent
                  ? 'border-amber bg-amber/5 ring-2 ring-amber/20'
                  : isPast
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Week {w.num}</p>
                  <p className="font-semibold text-sm text-gray-700">{w.label}</p>
                </div>
                {isCurrent && (
                  <span className="text-[10px] bg-amber text-navy font-bold px-2 py-0.5 rounded-full">CURRENT</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-3">{w.dates}</p>
              <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    w.percent >= 100 ? 'bg-emerald-500' : isCurrent ? 'bg-amber' : 'bg-gray-300'
                  }`}
                  style={{ width: `${w.percent}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">{w.done}/{w.total} tasks</p>
            </div>
          );
        })}
      </div>

      {/* Milestones */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="font-bold text-gray-700 mb-4">Key Milestones</h2>
        <div className="space-y-4">
          {milestones.map((m, i) => {
            const weekNum = weeks.findIndex(w => w.phase === m.phase) + 1;
            const reached = weekNum < currentWeek || (weekNum === currentWeek && currentWeek === 4);
            return (
              <div key={i} className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  reached ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  <m.icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${reached ? 'text-emerald-700' : 'text-gray-700'}`}>
                    {m.label}
                  </p>
                  <p className="text-xs text-gray-400">{m.day}</p>
                </div>
                {reached && (
                  <span className="text-emerald-500 text-xs font-semibold">&#10003; Reached</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
