import { useState, useEffect, useCallback } from 'react';
import { CountdownBanner } from '../components/CountdownBanner';
import type { ScopeItem, OrderItem, Decision, Measurement, SubContact, Zone, NextAction, GTDContext } from '../types';
import { schedule } from '../data/schedule';
import { deriveNextActions } from '../data/nextActions';
import { Phone, ShoppingBag, Monitor, Home, Clock, CheckCircle2, ArrowRight, Circle, CheckCircle, ChevronDown, ChevronRight, X, AlarmClock } from 'lucide-react';

const DISMISSED_KEY = 'remodel-dismissed-actions';
const SNOOZED_KEY = 'remodel-snoozed-actions';

interface SnoozedAction {
  id: string;
  until: string; // ISO date string
}

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

function loadSnoozed(): SnoozedAction[] {
  try {
    const raw = localStorage.getItem(SNOOZED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSnoozed(items: SnoozedAction[]) {
  localStorage.setItem(SNOOZED_KEY, JSON.stringify(items));
}

function getActiveSnoozedIds(): Set<string> {
  const now = new Date().toISOString();
  const snoozed = loadSnoozed();
  return new Set(snoozed.filter(s => s.until > now).map(s => s.id));
}

interface DashboardViewProps {
  scope: ScopeItem[];
  orders: OrderItem[];
  decisions: Decision[];
  measurements: Measurement[];
  subs: SubContact[];
  onNavigate: (view: string) => void;
}

const zones: Zone[] = ['Primary Bedroom', 'Primary Hallway', 'Primary Bathroom'];

const contextConfig: Record<GTDContext, { label: string; icon: typeof Phone; color: string; bg: string }> = {
  '@phone': { label: 'Calls to Make', icon: Phone, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  '@store': { label: 'Go Buy / Pick Up', icon: ShoppingBag, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  '@computer': { label: 'Order Online', icon: Monitor, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  '@home': { label: 'At the House', icon: Home, color: 'text-copper', bg: 'bg-copper/5 border-copper/20' },
  '@waiting': { label: 'Waiting For', icon: Clock, color: 'text-slate-light', bg: 'bg-gray-50 border-gray-200' },
};

const priorityDot: Record<string, string> = {
  urgent: 'bg-red-500',
  soon: 'bg-amber-400',
  later: 'bg-gray-300',
};

function getZoneProgress(scope: ScopeItem[], zone: Zone) {
  const items = scope.filter(s => s.zone === zone);
  const done = items.filter(s => s.status === 'Done').length;
  return { total: items.length, done, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}

function getCurrentWeek() {
  const now = new Date();
  const weekStarts = [
    new Date('2026-03-03'), new Date('2026-03-10'), new Date('2026-03-17'),
    new Date('2026-03-24'), new Date('2026-03-31'), new Date('2026-04-07'),
    new Date('2026-04-14'), new Date('2026-04-21'),
  ];
  for (let i = weekStarts.length - 1; i >= 0; i--) {
    if (now >= weekStarts[i]) return i;
  }
  return -1;
}

export function DashboardView({ scope, orders, decisions, measurements, subs, onNavigate }: DashboardViewProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(getActiveSnoozedIds);
  const [showWaiting, setShowWaiting] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [swipedAction, setSwipedAction] = useState<string | null>(null);

  const allActions = deriveNextActions({ orders, decisions, measurements, subs, scope });

  // Filter out dismissed and snoozed
  const visibleActions = allActions.filter(a => !dismissed.has(a.id) && !snoozedIds.has(a.id));
  const dismissedActions = allActions.filter(a => dismissed.has(a.id));

  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
    setSwipedAction(null);
  }, []);

  const undismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.delete(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  const snooze = useCallback((id: string, days: number) => {
    const until = new Date();
    until.setDate(until.getDate() + days);
    const snoozed = loadSnoozed().filter(s => s.id !== id);
    snoozed.push({ id, until: until.toISOString() });
    saveSnoozed(snoozed);
    setSnoozedIds(getActiveSnoozedIds());
    setSwipedAction(null);
  }, []);

  // Group by context
  const grouped = visibleActions.reduce<Record<GTDContext, NextAction[]>>((acc, a) => {
    if (!acc[a.context]) acc[a.context] = [];
    acc[a.context].push(a);
    return acc;
  }, {} as Record<GTDContext, NextAction[]>);

  const activeContexts: GTDContext[] = ['@phone', '@store', '@computer', '@home'];
  const waitingActions = grouped['@waiting'] || [];
  const activeActions = visibleActions.filter(a => a.context !== '@waiting');
  const totalActive = activeActions.length;
  const snoozedCount = allActions.filter(a => snoozedIds.has(a.id)).length;

  const currentWeekIdx = getCurrentWeek();
  const currentWeek = currentWeekIdx >= 0 && currentWeekIdx < schedule.length ? schedule[currentWeekIdx] : null;
  const totalScope = scope.length;
  const totalDone = scope.filter(s => s.status === 'Done').length;
  const overallPct = totalScope ? Math.round((totalDone / totalScope) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <CountdownBanner />

      {/* NEXT ACTIONS — the GTD engine */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-slate-dark">Next Actions</h1>
          <div className="flex items-center gap-3">
            {snoozedCount > 0 && (
              <span className="text-[10px] text-slate-light flex items-center gap-1">
                <AlarmClock size={10} /> {snoozedCount} snoozed
              </span>
            )}
            <span className="text-xs text-slate-light">{totalActive} active</span>
          </div>
        </div>

        {activeContexts.map(ctx => {
          const items = grouped[ctx];
          if (!items || items.length === 0) return null;
          const config = contextConfig[ctx];
          const Icon = config.icon;

          return (
            <div key={ctx} className={`rounded-lg border p-3 mb-3 ${config.bg}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={config.color} />
                <h2 className={`text-sm font-semibold ${config.color}`}>{config.label}</h2>
                <span className="text-[10px] text-slate-light">{items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.map(action => (
                  <div key={action.id} className="relative">
                    <div
                      className="flex items-start gap-2 group"
                    >
                      <div className="flex-1 min-w-0 flex items-start gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${priorityDot[action.priority]}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-dark">{action.action}</p>
                          <p className="text-[10px] text-slate-light">{action.source}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => onNavigate(action.sourceView)}
                          className="text-[10px] text-copper hover:underline"
                        >
                          Go
                        </button>
                        <button
                          onClick={() => setSwipedAction(swipedAction === action.id ? null : action.id)}
                          className="text-slate-light/40 hover:text-slate-light p-0.5"
                        >
                          <span className="text-[10px]">···</span>
                        </button>
                      </div>
                    </div>

                    {/* Dismiss / Snooze menu */}
                    {swipedAction === action.id && (
                      <div className="flex items-center gap-1 mt-1 ml-3 animate-fade-in">
                        <button
                          onClick={() => snooze(action.id, 1)}
                          className="text-[10px] bg-white/80 border border-gray-200 rounded px-2 py-0.5 text-slate-light hover:border-copper hover:text-copper"
                        >
                          1d
                        </button>
                        <button
                          onClick={() => snooze(action.id, 3)}
                          className="text-[10px] bg-white/80 border border-gray-200 rounded px-2 py-0.5 text-slate-light hover:border-copper hover:text-copper"
                        >
                          3d
                        </button>
                        <button
                          onClick={() => snooze(action.id, 7)}
                          className="text-[10px] bg-white/80 border border-gray-200 rounded px-2 py-0.5 text-slate-light hover:border-copper hover:text-copper"
                        >
                          1wk
                        </button>
                        <button
                          onClick={() => dismiss(action.id)}
                          className="text-[10px] bg-white/80 border border-red-200 rounded px-2 py-0.5 text-red-400 hover:border-red-400 hover:text-red-600 flex items-center gap-0.5"
                        >
                          <X size={8} /> Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Waiting For — collapsible */}
        {waitingActions.length > 0 && (
          <div className={`rounded-lg border p-3 mb-3 ${contextConfig['@waiting'].bg}`}>
            <button
              onClick={() => setShowWaiting(!showWaiting)}
              className="flex items-center gap-2 w-full"
            >
              {showWaiting ? <ChevronDown size={14} className="text-slate-light" /> : <ChevronRight size={14} className="text-slate-light" />}
              <Clock size={16} className="text-slate-light" />
              <h2 className="text-sm font-semibold text-slate-light">Waiting For</h2>
              <span className="text-[10px] text-slate-light">{waitingActions.length}</span>
            </button>
            {showWaiting && (
              <div className="space-y-1.5 mt-2">
                {waitingActions.map(action => (
                  <div key={action.id} className="flex items-start gap-2 ml-6">
                    <Clock size={14} className="mt-0.5 flex-shrink-0 text-gray-300" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-light">{action.action}</p>
                      <p className="text-[10px] text-slate-light/60">{action.source}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dismissed — recoverable */}
        {dismissedActions.length > 0 && (
          <button
            onClick={() => setShowDismissed(!showDismissed)}
            className="flex items-center gap-1 text-[10px] text-slate-light/50 hover:text-slate-light mb-2"
          >
            {showDismissed ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            {dismissedActions.length} dismissed
          </button>
        )}
        {showDismissed && dismissedActions.map(action => (
          <div key={action.id} className="flex items-center gap-2 ml-3 mb-1 opacity-40">
            <p className="text-[11px] text-slate-light line-through flex-1">{action.action}</p>
            <button
              onClick={() => undismiss(action.id)}
              className="text-[10px] text-copper hover:underline"
            >
              Restore
            </button>
          </div>
        ))}
      </div>

      {/* Compact Progress + Zone Cards */}
      <div className="bg-white rounded-lg border border-warm-dark p-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-semibold text-slate-dark">Project Progress</h2>
          <span className="text-sm font-bold text-copper">{overallPct}%</span>
        </div>
        <div className="w-full bg-warm-dark rounded-full h-2">
          <div className="bg-copper h-2 rounded-full transition-all" style={{ width: `${overallPct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          {zones.map(zone => {
            const { done, total, pct } = getZoneProgress(scope, zone);
            return (
              <div key={zone} className="text-center">
                <span className="text-[11px] text-slate-light">{zone.replace('Primary ', '')}</span>
                <p className="text-lg font-bold text-slate-dark">{pct}%</p>
                <span className="text-[10px] text-slate-light">{done}/{total}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* This Week — compact */}
      {currentWeek && (
        <div className="bg-white rounded-lg border border-warm-dark p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-dark">{currentWeek.label}</h2>
            <button
              onClick={() => onNavigate('schedule')}
              className="flex items-center gap-1 text-[11px] text-copper hover:underline"
            >
              Full schedule <ArrowRight size={10} />
            </button>
          </div>
          <div className="space-y-1.5">
            {currentWeek.tasks.map((task, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 size={14} className={`mt-0.5 flex-shrink-0 ${
                  task.status === 'Done' ? 'text-sage' : 'text-warm-dark'
                }`} />
                <p className={`text-sm ${task.status === 'Done' ? 'text-gray-400 line-through' : 'text-slate-dark'}`}>
                  {task.task}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
