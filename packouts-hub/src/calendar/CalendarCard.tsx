import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Clock, MapPin, CalendarDays, ExternalLink } from 'lucide-react';
import { getMcpClient } from '../jobs/McpClient';
import type { CalendarInfo, CalendarEvent } from './types';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ---------------------------------------------------------------------------
// CalendarCard — hub dashboard widget
// ---------------------------------------------------------------------------

export default function CalendarCard() {
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const calColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of calendars) m.set(c.id, c.color || '#4285F4');
    return m;
  }, [calendars]);

  // Week days for the strip
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);

  // Range for fetching: the visible week
  const rangeStart = weekDays[0];
  const rangeEnd = weekDays[6];

  // Fetch calendars on mount
  useEffect(() => {
    const client = getMcpClient('gcalendar');
    client.callTool<CalendarInfo[]>('list_calendars', {})
      .then((cals) => {
        setCalendars(cals);
        const initial = new Set(
          cals.filter(c => c.selected && !c.id.includes('#holiday@')).map(c => c.id)
        );
        setEnabledIds(initial);
      })
      .catch(() => { /* silent fail on dashboard */ })
      .finally(() => setLoading(false));
  }, []);

  // Fetch events when enabled calendars or week changes
  useEffect(() => {
    if (enabledIds.size === 0) {
      setEvents([]);
      return;
    }
    setEventsLoading(true);
    const client = getMcpClient('gcalendar');
    client.callTool<CalendarEvent[]>('list_events', {
      calendar_ids: Array.from(enabledIds),
      start_date: fmt(rangeStart),
      end_date: fmt(rangeEnd),
    })
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [enabledIds, rangeStart, rangeEnd]);

  // Events for selected date
  const dayEvents = useMemo(() => {
    const dateKey = fmt(selectedDate);
    return events.filter(ev => ev.start?.startsWith(dateKey));
  }, [events, selectedDate]);

  // Event dots per day (for the week strip)
  const dotsByDate = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const ev of events) {
      if (!ev.start) continue;
      const dk = ev.start.slice(0, 10);
      if (!m.has(dk)) m.set(dk, new Set());
      m.get(dk)!.add(calColorMap.get(ev.calendar_id) || '#4285F4');
    }
    return m;
  }, [events, calColorMap]);

  const toggleCalendar = useCallback((id: string) => {
    setEnabledIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const prevWeek = () => {
    const nw = new Date(weekStart);
    nw.setDate(nw.getDate() - 7);
    setWeekStart(nw);
  };

  const nextWeek = () => {
    const nw = new Date(weekStart);
    nw.setDate(nw.getDate() + 7);
    setWeekStart(nw);
  };

  const today = new Date();

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-bold text-gray-800">Calendar</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <CalendarDays className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800">Calendar</h3>
            <p className="text-[10px] text-gray-400">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {eventsLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-300" />}
          <Link to="/calendar" className="text-[10px] font-semibold text-navy hover:text-navy-light transition-colors">
            Full view &rarr;
          </Link>
        </div>
      </div>

      {/* Calendar toggles */}
      <div className="flex flex-wrap gap-1 mb-4">
        {calendars.map((cal) => (
          <button
            key={cal.id}
            onClick={() => toggleCalendar(cal.id)}
            className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
              enabledIds.has(cal.id)
                ? 'text-white border-transparent'
                : 'bg-white text-gray-400 border-gray-200'
            }`}
            style={enabledIds.has(cal.id) ? { backgroundColor: cal.color || '#4285F4' } : {}}
            title={cal.name}
          >
            {cal.name.length > 18 ? cal.name.slice(0, 18) + '...' : cal.name}
          </button>
        ))}
      </div>

      {/* Week strip */}
      <div className="flex items-center gap-1 mb-4">
        <button onClick={prevWeek} className="p-1 rounded hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5 text-gray-400" />
        </button>

        <div className="flex-1 grid grid-cols-7 gap-1">
          {weekDays.map((d, i) => {
            const key = fmt(d);
            const dots = dotsByDate.get(key);
            const isSelected = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, today);

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(new Date(d))}
                className={`flex flex-col items-center py-1.5 rounded-lg transition-all ${
                  isSelected
                    ? 'bg-navy text-white'
                    : isToday
                      ? 'bg-navy/5 text-navy'
                      : 'hover:bg-gray-50 text-gray-600'
                }`}
              >
                <span className={`text-[9px] font-semibold ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>
                  {DAY_LABELS[i]}
                </span>
                <span className="text-sm font-bold leading-tight">{d.getDate()}</span>
                {/* Event dots */}
                <div className="flex gap-0.5 mt-0.5 h-1.5">
                  {dots && Array.from(dots).slice(0, 3).map((color, j) => (
                    <span
                      key={j}
                      className="w-1 h-1 rounded-full"
                      style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.7)' : color }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <button onClick={nextWeek} className="p-1 rounded hover:bg-gray-100 transition-colors">
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      {/* Day events list */}
      {dayEvents.length === 0 ? (
        <p className="text-xs text-gray-300 text-center py-4">No events</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {dayEvents.map((ev) => {
            const color = ev.color || calColorMap.get(ev.calendar_id) || '#4285F4';
            return (
              <button
                key={ev.id}
                onClick={() => setSelectedEvent(ev)}
                className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <span
                  className="w-0.5 self-stretch rounded-full flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-navy transition-colors">
                    {ev.title}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {ev.all_day ? 'All day' : ev.start ? fmtTime(ev.start) : ''}
                    {!ev.all_day && ev.end ? ` – ${fmtTime(ev.end)}` : ''}
                    {ev.location ? ` · ${ev.location}` : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Event detail popover */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEvent(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl"
              style={{ backgroundColor: selectedEvent.color || calColorMap.get(selectedEvent.calendar_id) || '#4285F4' }}
            />
            <h3 className="text-lg font-bold text-gray-900 mt-1 mb-3">{selectedEvent.title}</h3>
            <div className="space-y-2.5 text-sm text-gray-600">
              {selectedEvent.start && (
                <div className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    {selectedEvent.all_day ? (
                      <span>All day &middot; {new Date(selectedEvent.start + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                    ) : (
                      <>
                        <div>{new Date(selectedEvent.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                        <div className="text-gray-500">
                          {fmtTime(selectedEvent.start)}
                          {selectedEvent.end && ` – ${fmtTime(selectedEvent.end)}`}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              {selectedEvent.location && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <span>{selectedEvent.location}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: calColorMap.get(selectedEvent.calendar_id) || '#4285F4' }}
                />
                <span className="text-gray-500">
                  {calendars.find(c => c.id === selectedEvent.calendar_id)?.name || selectedEvent.calendar_id}
                </span>
              </div>
              {selectedEvent.description && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-6">{selectedEvent.description}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
              {selectedEvent.html_link && (
                <a href={selectedEvent.html_link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy hover:text-navy-light transition-colors">
                  Open in Google Calendar <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button onClick={() => setSelectedEvent(null)}
                className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors ml-auto">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
