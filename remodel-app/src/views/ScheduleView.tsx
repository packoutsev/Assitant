import { useState, useRef, useEffect } from 'react';
import { schedule } from '../data/schedule';
import { ganttTasks } from '../data/gantt';
import type { GanttTask } from '../data/gantt';
import { CheckCircle2, Circle, List, BarChart3 } from 'lucide-react';

function getCurrentWeekIdx() {
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

const weekDates = ['Mar 3', 'Mar 10', 'Mar 17', 'Mar 24', 'Mar 31', 'Apr 7', 'Apr 14', 'Apr 21'];
const phaseLabels = ['Sourcing', 'Demo', 'Rough-In', 'Structural', 'Tile', 'Parallel', 'Finishes', 'Paint & Trim', 'Punch'];

const crewColors: Record<string, { bar: string; dot: string }> = {
  'You (GC)': { bar: '#C27840', dot: '#C27840' },
  'Carpenter': { bar: '#3B82F6', dot: '#3B82F6' },
  'Tile Installer': { bar: '#F59E0B', dot: '#F59E0B' },
  'Glass Co.': { bar: '#06B6D4', dot: '#06B6D4' },
};

const crewBgClasses: Record<string, string> = {
  'You (GC)': 'bg-copper/10 text-copper',
  'Carpenter': 'bg-blue-50 text-blue-700',
  'Tile Installer': 'bg-amber-50 text-amber-700',
  'Glass Co.': 'bg-cyan-50 text-cyan-700',
};

const phaseColors: Record<string, string> = {
  'Sourcing': 'border-l-slate-light',
  'Demo': 'border-l-red-400',
  'Rough-In': 'border-l-orange-400',
  'Structural': 'border-l-amber-500',
  'Tile': 'border-l-yellow-500',
  'Parallel': 'border-l-lime-500',
  'Finishes': 'border-l-emerald-500',
  'Paint & Trim': 'border-l-blue-400',
  'Punch': 'border-l-purple-400',
};

// Row height and header constants for SVG dependency lines
const ROW_H = 28;
const PHASE_HEADER_H = 24;
const GRID_TOP = 40; // space for week header row

function GanttChart() {
  const currentWeek = getCurrentWeekIdx();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [labelWidth, setLabelWidth] = useState(180);

  // Build ordered task list with phase headers for row index calculation
  const phases = phaseLabels.filter(p => ganttTasks.some(t => t.phase === p));
  const orderedRows: { type: 'phase'; phase: string }[] | { type: 'task'; task: GanttTask }[] = [];
  const taskRowMap = new Map<string, number>();

  let yOffset = 0;
  phases.forEach(phase => {
    const phaseTasks = ganttTasks.filter(t => t.phase === phase);
    if (phaseTasks.length === 0) return;
    (orderedRows as any[]).push({ type: 'phase', phase });
    yOffset += PHASE_HEADER_H;
    phaseTasks.forEach(task => {
      taskRowMap.set(task.id, yOffset + ROW_H / 2);
      (orderedRows as any[]).push({ type: 'task', task });
      yOffset += ROW_H;
    });
  });

  const totalHeight = yOffset;

  // Calculate dependency lines
  const depLines: { fromX: number; fromY: number; toX: number; toY: number }[] = [];
  ganttTasks.forEach(task => {
    if (!task.dependsOn) return;
    const toY = taskRowMap.get(task.id);
    if (toY === undefined) return;
    // toX = start of this task's bar (left edge of startWeek cell)
    const toWeekFrac = (task.startWeek - 1) / 8;

    task.dependsOn.forEach(depId => {
      const dep = ganttTasks.find(t => t.id === depId);
      if (!dep) return;
      const fromY = taskRowMap.get(depId);
      if (fromY === undefined) return;
      // fromX = end of dep task's bar (right edge of endWeek cell)
      const fromWeekFrac = dep.endWeek / 8;

      depLines.push({
        fromX: fromWeekFrac,
        fromY: GRID_TOP + fromY,
        toX: toWeekFrac,
        toY: GRID_TOP + toY,
      });
    });
  });

  // Responsive label width
  useEffect(() => {
    function onResize() {
      if (containerRef.current) {
        setLabelWidth(containerRef.current.clientWidth < 500 ? 120 : 180);
      }
    }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(crewBgClasses).map(([crew, cls]) => (
          <span key={crew} className={`text-[10px] font-medium px-2 py-0.5 rounded ${cls}`}>{crew}</span>
        ))}
      </div>

      {/* Gantt */}
      <div ref={containerRef} className="overflow-x-auto bg-white rounded-lg border border-warm-dark">
        <div className="min-w-[580px] relative" style={{ paddingTop: GRID_TOP }}>

          {/* Week column headers */}
          <div className="absolute top-0 left-0 right-0 flex" style={{ height: GRID_TOP }}>
            <div style={{ width: labelWidth }} className="flex-shrink-0" />
            <div className="flex-1 grid grid-cols-8">
              {weekDates.map((d, i) => (
                <div
                  key={i}
                  className={`flex flex-col items-center justify-center text-[10px] border-b ${
                    i === currentWeek ? 'bg-copper/5 text-copper font-bold border-copper' : 'text-slate-light border-warm-dark'
                  }`}
                >
                  <span>W{i + 1}</span>
                  <span className="text-[8px]">{d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SVG overlay for dependency lines */}
          <svg
            ref={svgRef}
            className="absolute top-0 left-0 w-full pointer-events-none"
            style={{ height: GRID_TOP + totalHeight + 20 }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
              </marker>
            </defs>
            {depLines.map((line, i) => {
              const gridLeft = labelWidth;
              const gridWidth = containerRef.current ? containerRef.current.clientWidth - labelWidth : 400;

              const x1 = gridLeft + line.fromX * gridWidth;
              const y1 = line.fromY;
              const x2 = gridLeft + line.toX * gridWidth;
              const y2 = line.toY;

              // Route: right from source, down/up, then right to target
              const midX = Math.min(x1 + 8, x2 - 4);

              return (
                <g key={i}>
                  <path
                    d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth="1"
                    strokeDasharray="3,2"
                    markerEnd="url(#arrowhead)"
                  />
                </g>
              );
            })}
          </svg>

          {/* Rows */}
          <div className="relative" style={{ zIndex: 1 }}>
            {phases.map(phase => {
              const phaseTasks = ganttTasks.filter(t => t.phase === phase);
              if (phaseTasks.length === 0) return null;
              const borderColor = phaseColors[phase] || 'border-l-gray-300';

              return (
                <div key={phase}>
                  {/* Phase header */}
                  <div
                    className={`flex items-center border-l-4 ${borderColor} bg-warm/80`}
                    style={{ height: PHASE_HEADER_H }}
                  >
                    <div
                      style={{ width: labelWidth }}
                      className="flex-shrink-0 pl-2 text-[10px] font-bold text-slate-dark uppercase tracking-wide"
                    >
                      {phase}
                    </div>
                    <div className="flex-1 grid grid-cols-8">
                      {weekDates.map((_, i) => (
                        <div key={i} className={`border-l ${i === currentWeek ? 'border-copper/20' : 'border-warm-dark/30'}`} />
                      ))}
                    </div>
                  </div>

                  {/* Task rows */}
                  {phaseTasks.map(task => {
                    const colors = crewColors[task.crew] || { bar: '#9CA3AF', dot: '#9CA3AF' };
                    return (
                      <div
                        key={task.id}
                        className={`flex items-center border-l-4 ${borderColor} hover:bg-warm-dark/20 transition-colors`}
                        style={{ height: ROW_H }}
                      >
                        {/* Task label */}
                        <div
                          style={{ width: labelWidth }}
                          className="flex-shrink-0 pl-4 pr-2 text-[10px] text-slate-dark truncate flex items-center gap-1.5"
                          title={`${task.label} (${task.crew})`}
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: colors.dot }}
                          />
                          <span className="truncate">{task.label}</span>
                        </div>

                        {/* Bar cells */}
                        <div className="flex-1 grid grid-cols-8">
                          {weekDates.map((_, weekIdx) => {
                            const isActive = weekIdx >= task.startWeek - 1 && weekIdx <= task.endWeek - 1;
                            const isStart = weekIdx === task.startWeek - 1;
                            const isEnd = weekIdx === task.endWeek - 1;
                            const isSingleWeek = task.startWeek === task.endWeek;

                            return (
                              <div
                                key={weekIdx}
                                className={`flex items-center px-0.5 border-l ${
                                  weekIdx === currentWeek ? 'border-copper/20 bg-copper/5' : 'border-warm-dark/30'
                                }`}
                              >
                                {isActive && (
                                  <div
                                    className={`w-full h-4 ${
                                      isSingleWeek ? 'rounded' :
                                      isStart ? 'rounded-l' :
                                      isEnd ? 'rounded-r' : ''
                                    }`}
                                    style={{ backgroundColor: colors.bar, opacity: 0.8 }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Deadline row */}
          <div className="flex items-center border-t border-warm-dark mt-1" style={{ height: ROW_H }}>
            <div style={{ width: labelWidth }} className="flex-shrink-0 pl-2 text-[10px] font-bold text-red-600">
              DEADLINE — Apr 21
            </div>
            <div className="flex-1 grid grid-cols-8">
              {weekDates.map((_, i) => (
                <div key={i} className={`flex items-center px-0.5 border-l ${i === currentWeek ? 'border-copper/20' : 'border-warm-dark/30'}`}>
                  {i === 7 && (
                    <div className="w-full flex items-center">
                      <div className="flex-1 h-0.5 bg-red-500" />
                      <div className="w-2.5 h-2.5 bg-red-500 rounded-full -ml-1" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Critical path callouts */}
      <div className="bg-white rounded-lg border border-warm-dark p-3">
        <h3 className="text-xs font-semibold text-slate-dark mb-2">Critical Path & Dependencies</h3>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
            <p className="text-[11px] text-slate-dark"><strong>Aluminum door</strong> — order W1, 3-week lead, install W4. Blocks blinds + threshold.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
            <p className="text-[11px] text-slate-dark"><strong>Glass shower door</strong> — measure W4 after framing, 2-3 wk lead, install W6. Can't tile until framing done.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
            <p className="text-[11px] text-slate-dark"><strong>Demo → plumbing → framing → pan → tile → limewash → glass</strong> — longest chain, no slack.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-sage mt-1.5 flex-shrink-0" />
            <p className="text-[11px] text-slate-dark"><strong>Bedroom work (PAX, aluminum door, paint)</strong> — runs parallel to bathroom tile, good use of downtime.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListView() {
  const currentWeekIdx = getCurrentWeekIdx();

  return (
    <div className="space-y-3">
      {schedule.map((week, i) => {
        const isCurrent = i === currentWeekIdx;
        const isPast = i < currentWeekIdx;
        return (
          <div
            key={week.week}
            className={`rounded-lg border p-4 transition-all ${
              isCurrent
                ? 'bg-copper/5 border-copper/30 ring-1 ring-copper/20'
                : isPast
                ? 'bg-warm-dark/30 border-warm-dark'
                : 'bg-white border-warm-dark'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className={`text-sm font-semibold ${isCurrent ? 'text-copper' : 'text-slate-dark'}`}>
                  {week.label}
                </h3>
                {isCurrent && (
                  <span className="text-[10px] font-medium bg-copper text-white px-1.5 py-0.5 rounded">NOW</span>
                )}
              </div>
              <span className="text-[11px] text-slate-light">{week.dateRange}</span>
            </div>
            <div className="space-y-1.5">
              {week.tasks.map((task, j) => (
                <div key={j} className="flex items-start gap-2">
                  {task.status === 'Done' ? (
                    <CheckCircle2 size={14} className="mt-0.5 text-sage flex-shrink-0" />
                  ) : (
                    <Circle size={14} className={`mt-0.5 flex-shrink-0 ${isPast ? 'text-red-300' : 'text-warm-dark'}`} />
                  )}
                  <div className="flex-1 flex items-start justify-between gap-2">
                    <p className={`text-sm ${task.status === 'Done' ? 'line-through text-gray-400' : isPast ? 'text-red-700' : 'text-slate-dark'}`}>
                      {task.task}
                    </p>
                    <span className="text-[10px] text-slate-light whitespace-nowrap">{task.zone.replace('Primary ', '')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ScheduleView() {
  const [mode, setMode] = useState<'list' | 'gantt'>('gantt');

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-dark">Schedule</h1>
          <p className="text-xs text-slate-light">8-week critical path — March 3 to April 21</p>
        </div>
        <div className="flex items-center bg-warm-dark rounded-lg p-0.5">
          <button
            onClick={() => setMode('gantt')}
            className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md transition-colors ${
              mode === 'gantt' ? 'bg-white text-copper shadow-sm' : 'text-slate-light hover:text-slate-dark'
            }`}
          >
            <BarChart3 size={12} />
            Gantt
          </button>
          <button
            onClick={() => setMode('list')}
            className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md transition-colors ${
              mode === 'list' ? 'bg-white text-copper shadow-sm' : 'text-slate-light hover:text-slate-dark'
            }`}
          >
            <List size={12} />
            List
          </button>
        </div>
      </div>

      {mode === 'gantt' ? <GanttChart /> : <ListView />}
    </div>
  );
}
