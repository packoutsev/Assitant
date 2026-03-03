import { useMemo, useState } from 'react';
import { CalendarCheck, Sun, Clock, HelpCircle, X, ChevronRight } from 'lucide-react';
import type { DailyTask, TaskStatus } from '../types';
import type { ViewId } from '../components/Layout';
import TaskCard from '../components/TaskCard';

interface TodayViewProps {
  tasks: DailyTask[];
  onStatusChange: (task: DailyTask, status: TaskStatus) => void;
  onNavigate?: (view: ViewId) => void;
}

function getWeekLabel(date: Date): string {
  const start = new Date(2026, 2, 9);
  const diff = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Before Start';
  if (diff < 5) return 'Week 1 — Foundation';
  if (diff < 12) return 'Week 2 — Guided Practice';
  if (diff < 19) return 'Week 3 — Ramp';
  if (diff < 26) return 'Week 4 — Full Production';
  return 'Post-Onboarding';
}

function parseDayKey(day: string): string {
  const match = day.match(/(\d+)\/(\d+)/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}`;
}

function getTodayKey(): string {
  const now = new Date();
  return `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}`;
}

function getDayInfo(): { dayNum: number; daysUntilStart: number } {
  const start = new Date(2026, 2, 9);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return { dayNum: diff + 1, daysUntilStart: -diff };
}

function HowItWorks({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="bg-white border border-navy/15 rounded-2xl p-5 mb-6 relative">
      <button onClick={onDismiss} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle className="w-5 h-5 text-navy" />
        <h2 className="font-bold text-navy text-sm">How to use this dashboard</h2>
      </div>
      <div className="space-y-3 text-sm text-gray-600">
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-lg border-2 border-gray-300 flex items-center justify-center shrink-0 mt-0.5">
          </div>
          <div>
            <p className="font-medium text-gray-700">Work through tasks top to bottom</p>
            <p className="text-xs text-gray-400">Each day has a numbered list. The gold-highlighted task is your next one.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-lg border-2 border-amber bg-amber/10 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-amber text-xs font-bold">&#9679;</span>
          </div>
          <div>
            <p className="font-medium text-gray-700">Click the circle to update status</p>
            <p className="text-xs text-gray-400">Empty = Not Started. Click once = In Progress. Click again = Done.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-white text-sm font-bold">&#10003;</span>
          </div>
          <div>
            <p className="font-medium text-gray-700">Green check = Done</p>
            <p className="text-xs text-gray-400">Your progress saves automatically. Matt can see your progress too.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-lg bg-navy/5 border border-navy/10 flex items-center justify-center shrink-0 mt-0.5">
            <ChevronRight className="w-3.5 h-3.5 text-navy" />
          </div>
          <div>
            <p className="font-medium text-gray-700">Blue buttons open tools and resources</p>
            <p className="text-xs text-gray-400">Click them to go directly to HubSpot, Sagan, the Playbook, etc.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TodayView({ tasks, onStatusChange, onNavigate }: TodayViewProps) {
  const todayKey = getTodayKey();
  const { dayNum, daysUntilStart } = getDayInfo();
  const [showHelp, setShowHelp] = useState(() => {
    return localStorage.getItem('sdr_help_dismissed') !== 'true';
  });

  function dismissHelp() {
    setShowHelp(false);
    localStorage.setItem('sdr_help_dismissed', 'true');
  }

  const todayTasks = useMemo(() => {
    const matched = tasks.filter(t => parseDayKey(t.Day) === todayKey);
    if (matched.length > 0) return matched;
    const allDayKeys = [...new Set(tasks.map(t => parseDayKey(t.Day)))].filter(Boolean).sort();
    const nextDay = allDayKeys.find(d => d > todayKey);
    if (nextDay) return tasks.filter(t => parseDayKey(t.Day) === nextDay);
    return [];
  }, [tasks, todayKey]);

  const isToday = todayTasks.length > 0 && parseDayKey(todayTasks[0].Day) === todayKey;
  const displayDay = todayTasks.length > 0 ? todayTasks[0].Day : 'No tasks';

  const doneCount = todayTasks.filter(t => t.Status === 'Done').length;
  const totalCount = todayTasks.length;
  const progressPercent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  // Find the first incomplete task index
  const firstIncompleteIdx = todayTasks.findIndex(t => t.Status !== 'Done');

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        {daysUntilStart > 0 ? (
          <div className="bg-gradient-to-r from-navy to-navy-light rounded-2xl p-6 text-white mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Sun className="w-6 h-6 text-amber" />
              <h1 className="text-xl font-bold">Welcome, Vanessa!</h1>
            </div>
            <p className="text-white/70 text-sm">
              Your onboarding starts in <span className="text-amber font-bold">{daysUntilStart} day{daysUntilStart !== 1 ? 's' : ''}</span> — Monday, March 9, 2026
            </p>
            <p className="text-white/50 text-xs mt-2">Preview your Day 1 tasks below. Each task has links to the tools you'll need.</p>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-navy to-navy-light rounded-2xl p-6 text-white mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CalendarCheck className="w-5 h-5 text-amber" />
                  <p className="text-white/50 text-xs uppercase tracking-wider">
                    {isToday ? 'Today' : 'Next Up'}
                  </p>
                </div>
                <h1 className="text-xl font-bold">{displayDay}</h1>
                <p className="text-white/50 text-sm mt-1">
                  {getWeekLabel(new Date())} {dayNum > 0 ? `— Day ${dayNum}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-amber">{doneCount}/{totalCount}</p>
                <p className="text-white/40 text-xs">tasks done</p>
              </div>
            </div>

            <div className="mt-4 bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {doneCount === totalCount && totalCount > 0 && (
              <p className="text-emerald-300 text-sm font-medium mt-3 text-center">
                All done for today! Great work.
              </p>
            )}
          </div>
        )}
      </div>

      {/* How it works */}
      {showHelp && <HowItWorks onDismiss={dismissHelp} />}
      {!showHelp && (
        <button
          onClick={() => setShowHelp(true)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-navy mb-4 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          How does this work?
        </button>
      )}

      {/* Task list */}
      <div className="space-y-3">
        {todayTasks.length > 0 ? (
          todayTasks.map((task, idx) => (
            <TaskCard
              key={task._row}
              task={task}
              onStatusChange={onStatusChange}
              onNavigate={onNavigate}
              stepNumber={idx + 1}
              isNext={idx === firstIncompleteIdx}
            />
          ))
        ) : (
          <div className="text-center py-12 text-gray-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No tasks scheduled</p>
            <p className="text-sm">Check back on a workday</p>
          </div>
        )}
      </div>
    </div>
  );
}
