import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, AlertCircle, MapPin, Clock, ExternalLink, CalendarDays } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/AuthContext';
import { getMcpClient } from '../jobs/McpClient';
import type { CalendarInfo, CalendarEvent } from './types';

// ---------------------------------------------------------------------------
// Date helpers (local timezone — Arizona has no DST)
// ---------------------------------------------------------------------------

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function addWeeks(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n * 7); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; }
function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

function fmtMonth(d: Date) { return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
function fmtDay(d: Date) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
function fmtWeekRange(d: Date) {
  const end = new Date(d); end.setDate(end.getDate() + 6);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_HEADERS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
type View = 'day' | 'week' | 'month';

// ---------------------------------------------------------------------------
// Firestore prefs
// ---------------------------------------------------------------------------

const PREFS_COLLECTION = 'calendar_prefs';
async function loadPrefs(email: string): Promise<string[] | null> {
  try {
    const snap = await getDoc(doc(db, PREFS_COLLECTION, email));
    if (snap.exists()) return snap.data().hidden_ids as string[];
    return null;
  } catch { return null; }
}
async function savePrefs(email: string, hiddenIds: string[]) {
  try { await setDoc(doc(db, PREFS_COLLECTION, email), { hidden_ids: hiddenIds }, { merge: true }); }
  catch { /* silent */ }
}

// ---------------------------------------------------------------------------
// Mini calendar (sidebar)
// ---------------------------------------------------------------------------

function MiniCalendar({ anchor, onSelectDate, dotDates, today }: {
  anchor: Date;
  onSelectDate: (d: Date) => void;
  dotDates: Set<string>;
  today: Date;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1));

  // Sync mini calendar month when anchor changes
  useEffect(() => {
    setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  }, [anchor.getFullYear(), anchor.getMonth()]);

  const cells = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const last = endOfMonth(viewMonth);
    const start = startOfWeek(first);
    const days: Date[] = [];
    const d = new Date(start);
    const endGrid = addDays(last, 6 - last.getDay());
    while (d <= endGrid) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return days;
  }, [viewMonth]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-700">
          {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <div className="flex gap-0.5">
          <button onClick={() => setViewMonth(addMonths(viewMonth, -1))} className="p-0.5 rounded hover:bg-gray-100">
            <ChevronLeft className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="p-0.5 rounded hover:bg-gray-100">
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {DAY_HEADERS_SHORT.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
        ))}
        {cells.map((cell, i) => {
          const key = localDate(cell);
          const inMonth = cell.getMonth() === viewMonth.getMonth();
          const isToday = isSameDay(cell, today);
          const isSelected = isSameDay(cell, anchor);
          const hasDot = dotDates.has(key);

          return (
            <button
              key={i}
              onClick={() => onSelectDate(new Date(cell))}
              className={`relative flex flex-col items-center justify-center h-7 rounded-full text-[11px] transition-all ${
                !inMonth ? 'text-gray-300' :
                isSelected ? 'bg-navy text-white font-bold' :
                isToday ? 'bg-navy/10 text-navy font-bold' :
                'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {cell.getDate()}
              {hasDot && !isSelected && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-navy/40" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const { profile } = useAuth();
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('day');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const calColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of calendars) m.set(c.id, c.color || '#5f6368');
    return m;
  }, [calendars]);

  const calNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of calendars) m.set(c.id, c.name);
    return m;
  }, [calendars]);

  // Date range to fetch
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'day') return { rangeStart: anchor, rangeEnd: anchor };
    if (view === 'week') {
      const ws = startOfWeek(anchor);
      return { rangeStart: ws, rangeEnd: addDays(ws, 6) };
    }
    const ms = startOfMonth(anchor);
    const me = endOfMonth(anchor);
    return { rangeStart: startOfWeek(ms), rangeEnd: addDays(me, 6 - me.getDay()) };
  }, [view, anchor]);

  // Load calendars + prefs
  useEffect(() => {
    const email = profile?.email;
    const client = getMcpClient('gcalendar');
    Promise.all([
      client.callTool<CalendarInfo[]>('list_calendars', {}),
      email ? loadPrefs(email) : Promise.resolve(null),
    ])
      .then(([cals, hiddenIds]) => {
        setCalendars(cals);
        const hidden = new Set(hiddenIds || []);
        const initial = new Set(
          cals.filter(c => !hidden.has(c.id) && (hiddenIds !== null || !c.id.includes('#holiday@'))).map(c => c.id)
        );
        setEnabledIds(initial);
        setPrefsLoaded(true);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [profile?.email]);

  // Persist prefs
  useEffect(() => {
    if (!prefsLoaded || !profile?.email) return;
    const hiddenIds = calendars.filter(c => !enabledIds.has(c.id)).map(c => c.id);
    savePrefs(profile.email, hiddenIds);
  }, [enabledIds, prefsLoaded, profile?.email, calendars]);

  // Fetch events
  useEffect(() => {
    if (enabledIds.size === 0) { setEvents([]); return; }
    setEventsLoading(true);
    getMcpClient('gcalendar').callTool<CalendarEvent[]>('list_events', {
      calendar_ids: Array.from(enabledIds),
      start_date: localDate(rangeStart),
      end_date: localDate(rangeEnd),
    })
      .then(setEvents)
      .catch((e) => setError(e.message))
      .finally(() => setEventsLoading(false));
  }, [enabledIds, rangeStart, rangeEnd]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (!ev.start) continue;
      const dateKey = ev.all_day ? ev.start.slice(0, 10) : localDate(new Date(ev.start));
      if (!m.has(dateKey)) m.set(dateKey, []);
      m.get(dateKey)!.push(ev);
    }
    return m;
  }, [events]);

  // Set of dates with events (for mini calendar dots)
  const dotDates = useMemo(() => new Set(eventsByDate.keys()), [eventsByDate]);

  // Navigation
  const goBack = useCallback(() => {
    setAnchor(prev => view === 'month' ? addMonths(prev, -1) : view === 'week' ? addWeeks(prev, -1) : addDays(prev, -1));
  }, [view]);
  const goForward = useCallback(() => {
    setAnchor(prev => view === 'month' ? addMonths(prev, 1) : view === 'week' ? addWeeks(prev, 1) : addDays(prev, 1));
  }, [view]);
  const goToday = useCallback(() => setAnchor(new Date()), []);

  const toggleCalendar = useCallback((id: string) => {
    setEnabledIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  // Grid cells for month/week
  const gridCells = useMemo(() => {
    if (view === 'day') return [];
    const cells: Date[] = [];
    const d = new Date(rangeStart);
    while (d <= rangeEnd) { cells.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return cells;
  }, [rangeStart, rangeEnd, view]);

  const today = new Date();
  const titleText = view === 'day' ? fmtDay(anchor) : view === 'week' ? fmtWeekRange(startOfWeek(anchor)) : fmtMonth(anchor);

  // Day view events
  const dayKey = localDate(anchor);
  const dayAllDay = useMemo(() => (eventsByDate.get(dayKey) || []).filter(e => e.all_day), [eventsByDate, dayKey]);
  const dayTimed = useMemo(() => {
    const timed = (eventsByDate.get(dayKey) || []).filter(e => !e.all_day);
    return timed.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }, [eventsByDate, dayKey]);

  if (loading) {
    return (
      <div className="min-h-screen bg-warm flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-navy" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm">
      {/* Header */}
      <header className="bg-navy text-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors text-sm shrink-0">
            <ArrowLeft className="w-4 h-4" /> Hub
          </Link>
          <div className="w-px h-5 bg-white/20" />
          <h1 className="text-base font-bold tracking-tight">Calendar</h1>
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <CalendarDays className="w-4 h-4" />
          </button>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex gap-5">
        {/* ================================================================ */}
        {/* SIDEBAR                                                         */}
        {/* ================================================================ */}
        {/* Mobile: slide-in overlay. Desktop: always visible. */}
        <>
          {/* Mobile backdrop */}
          {sidebarOpen && (
            <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
          )}
          <aside className={`
            fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 transform transition-transform duration-200
            lg:relative lg:top-auto lg:left-auto lg:h-auto lg:w-56 lg:transform-none lg:z-auto lg:bg-transparent lg:border-0 lg:flex-shrink-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}>
            <div className="p-4 lg:p-0 space-y-5 lg:sticky lg:top-20">
              {/* Mini calendar */}
              <div className="bg-white rounded-xl border border-gray-200 p-3 lg:p-3.5">
                <MiniCalendar
                  anchor={anchor}
                  onSelectDate={(d) => { setAnchor(d); setView('day'); setSidebarOpen(false); }}
                  dotDates={dotDates}
                  today={today}
                />
              </div>

              {/* Calendar toggles */}
              <div className="bg-white rounded-xl border border-gray-200 p-3 lg:p-3.5">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Calendars</h3>
                <div className="space-y-0.5">
                  {calendars.map((cal) => {
                    const enabled = enabledIds.has(cal.id);
                    const color = cal.color || '#5f6368';
                    return (
                      <button
                        key={cal.id}
                        onClick={() => toggleCalendar(cal.id)}
                        className="w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors text-left group"
                      >
                        <span
                          className="w-3 h-3 rounded-sm flex-shrink-0 border-2 flex items-center justify-center transition-all"
                          style={{ borderColor: color, backgroundColor: enabled ? color : 'transparent' }}
                        >
                          {enabled && (
                            <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className={`text-xs truncate transition-colors ${enabled ? 'text-gray-700' : 'text-gray-400'}`}>
                          {cal.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        </>

        {/* ================================================================ */}
        {/* MAIN CONTENT                                                    */}
        {/* ================================================================ */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <button onClick={goToday} className="text-xs font-semibold border border-gray-300 text-gray-600 hover:bg-white hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors">
                Today
              </button>
              <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-white transition-colors">
                <ChevronLeft className="w-4 h-4 text-gray-400" />
              </button>
              <button onClick={goForward} className="p-1.5 rounded-lg hover:bg-white transition-colors">
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
              <h2 className="text-base font-bold text-gray-800 ml-1">{titleText}</h2>
              {eventsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300 ml-2" />}
            </div>
            <div className="flex bg-white border border-gray-200 rounded-lg p-0.5">
              {(['day', 'week', 'month'] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
                    view === v ? 'bg-navy text-white' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* ============================================================ */}
          {/* DAY VIEW — Agenda list                                       */}
          {/* ============================================================ */}
          {view === 'day' && (
            <div className="space-y-3">
              {/* All-day events */}
              {dayAllDay.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">All Day</p>
                  <div className="space-y-1.5">
                    {dayAllDay.map((ev) => {
                      const color = calColorMap.get(ev.calendar_id) || '#5f6368';
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="w-full text-left flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors group"
                        >
                          <span className="w-2.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800 group-hover:text-navy transition-colors truncate">
                              {ev.title}
                            </p>
                            <p className="text-xs text-gray-400">{calNameMap.get(ev.calendar_id)}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Timed events */}
              {dayTimed.length > 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {dayTimed.map((ev) => {
                    const color = calColorMap.get(ev.calendar_id) || '#5f6368';
                    return (
                      <button
                        key={ev.id}
                        onClick={() => setSelectedEvent(ev)}
                        className="w-full text-left flex items-start gap-4 p-4 hover:bg-gray-50/50 transition-colors group first:rounded-t-xl last:rounded-b-xl"
                      >
                        {/* Time column */}
                        <div className="w-16 flex-shrink-0 pt-0.5">
                          <p className="text-sm font-semibold text-gray-700">{ev.start ? fmtTime(ev.start) : ''}</p>
                          {ev.end && <p className="text-[11px] text-gray-400">{fmtTime(ev.end)}</p>}
                        </div>

                        {/* Color bar */}
                        <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 group-hover:text-navy transition-colors">
                            {ev.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                            {ev.location && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <MapPin className="w-3 h-3" /> {ev.location}
                              </span>
                            )}
                            <span className="text-xs text-gray-300">{calNameMap.get(ev.calendar_id)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : dayAllDay.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 py-20 text-center">
                  <CalendarDays className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No events scheduled</p>
                  <p className="text-xs text-gray-300 mt-1">{fmtDay(anchor)}</p>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* WEEK VIEW                                                    */}
          {/* ============================================================ */}
          {view === 'week' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-7 border-b border-gray-200">
                {(() => {
                  const ws = startOfWeek(anchor);
                  return DAY_HEADERS.map((label, i) => {
                    const d = addDays(ws, i);
                    const isToday = isSameDay(d, today);
                    return (
                      <div key={i} className={`text-center py-2.5 ${i > 0 ? 'border-l border-gray-100' : ''}`}>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase">{label}</p>
                        <button
                          onClick={() => { setAnchor(new Date(d)); setView('day'); }}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold mt-0.5 transition-colors ${
                            isToday ? 'bg-navy text-white' : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {d.getDate()}
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="grid grid-cols-7 min-h-[420px]">
                {gridCells.map((cell, i) => {
                  const dateKey = localDate(cell);
                  const cellEvents = eventsByDate.get(dateKey) || [];

                  return (
                    <div key={i} className={`border-b border-gray-50 p-2 ${i % 7 > 0 ? 'border-l border-gray-100' : ''}`}>
                      <div className="space-y-1">
                        {cellEvents.slice(0, 6).map((ev) => {
                          const color = calColorMap.get(ev.calendar_id) || '#5f6368';
                          return (
                            <button
                              key={ev.id}
                              onClick={() => setSelectedEvent(ev)}
                              className="w-full text-left rounded-md px-2 py-1 text-[11px] font-medium text-gray-700 hover:brightness-95 transition-all truncate"
                              style={{ backgroundColor: color + '18', borderLeft: `2px solid ${color}` }}
                              title={ev.title}
                            >
                              {!ev.all_day && ev.start && (
                                <span className="text-gray-400 mr-1">{fmtTime(ev.start)}</span>
                              )}
                              {ev.title}
                            </button>
                          );
                        })}
                        {cellEvents.length > 6 && (
                          <button
                            onClick={() => { setAnchor(new Date(cell)); setView('day'); }}
                            className="text-[10px] text-gray-400 font-semibold pl-2 hover:text-navy"
                          >
                            +{cellEvents.length - 6} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MONTH VIEW                                                   */}
          {/* ============================================================ */}
          {view === 'month' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/60">
                {DAY_HEADERS.map((d) => (
                  <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider py-2.5">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {gridCells.map((cell, i) => {
                  const dateKey = localDate(cell);
                  const cellEvents = eventsByDate.get(dateKey) || [];
                  const isToday = isSameDay(cell, today);
                  const inMonth = cell.getMonth() === anchor.getMonth();

                  return (
                    <div
                      key={i}
                      className={`border-b border-r border-gray-100 p-1.5 min-h-[100px] ${!inMonth ? 'bg-gray-50/40' : ''}`}
                    >
                      <div className="text-right mb-1">
                        <button
                          onClick={() => { setAnchor(new Date(cell)); setView('day'); }}
                          className={`inline-flex items-center justify-center text-xs font-bold w-6 h-6 rounded-full transition-colors ${
                            isToday ? 'bg-navy text-white' : !inMonth ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {cell.getDate()}
                        </button>
                      </div>
                      <div className="space-y-px">
                        {cellEvents.slice(0, 3).map((ev) => {
                          const color = calColorMap.get(ev.calendar_id) || '#5f6368';
                          return (
                            <button
                              key={ev.id}
                              onClick={() => setSelectedEvent(ev)}
                              className="w-full text-left rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight truncate hover:brightness-95 transition-all"
                              style={{ backgroundColor: color + '18', color: '#374151' }}
                              title={ev.title}
                            >
                              {!ev.all_day && ev.start && (
                                <span className="text-gray-400 mr-0.5">{new Date(ev.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '')}</span>
                              )}
                              {ev.title}
                            </button>
                          );
                        })}
                        {cellEvents.length > 3 && (
                          <button
                            onClick={() => { setAnchor(new Date(cell)); setView('day'); }}
                            className="text-[9px] text-gray-400 font-semibold pl-1 hover:text-navy"
                          >
                            +{cellEvents.length - 3} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* EVENT DETAIL MODAL                                               */}
      {/* ================================================================ */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEvent(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Color strip */}
            <div className="h-1.5" style={{ backgroundColor: calColorMap.get(selectedEvent.calendar_id) || '#5f6368' }} />
            <div className="p-5">
              <h3 className="text-base font-bold text-gray-900 mb-3">{selectedEvent.title}</h3>
              <div className="space-y-3 text-sm">
                {/* Time */}
                {selectedEvent.start && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
                    <div>
                      {selectedEvent.all_day ? (
                        <span className="text-gray-600">
                          All day &middot; {new Date(selectedEvent.start + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })}
                        </span>
                      ) : (
                        <>
                          <p className="text-gray-700 font-medium">
                            {new Date(selectedEvent.start).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })}
                          </p>
                          <p className="text-gray-500">
                            {fmtTime(selectedEvent.start)}{selectedEvent.end && ` – ${fmtTime(selectedEvent.end)}`}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Location */}
                {selectedEvent.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">{selectedEvent.location}</span>
                  </div>
                )}

                {/* Calendar */}
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded flex-shrink-0"
                    style={{ backgroundColor: calColorMap.get(selectedEvent.calendar_id) || '#5f6368' }}
                  />
                  <span className="text-gray-500">{calNameMap.get(selectedEvent.calendar_id) || 'Calendar'}</span>
                </div>

                {/* Description */}
                {selectedEvent.description && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400 whitespace-pre-wrap line-clamp-6">{selectedEvent.description}</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
                {selectedEvent.html_link && (
                  <a href={selectedEvent.html_link} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy hover:text-navy-light transition-colors">
                    Open in Google Calendar <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button onClick={() => setSelectedEvent(null)} className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors ml-auto">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
