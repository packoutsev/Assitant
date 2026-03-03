import { useState, useEffect, useCallback } from 'react';
import type { DailyTask, ToolAccess, KPIRow, TrainingModule, QuickRefEntry } from '../types';
import { mockDailyPlan, mockToolAccess, mockKpiRamp, mockTrainingLog, mockQuickRef } from '../api/mockData';
import { fetchTab, parseRows, updateCell } from '../api/sheets';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

// Parse the Quick Reference tab's special format (section headers + key/value pairs)
function parseQuickRef(raw: unknown[][]): QuickRefEntry[] {
  const entries: QuickRefEntry[] = [];
  let currentSection = '';
  for (const row of raw) {
    const a = String((row as string[])[0] ?? '').trim();
    const b = String((row as string[])[1] ?? '').trim();
    if (a.startsWith('---') && a.endsWith('---')) {
      currentSection = a.replace(/---/g, '').trim();
    } else if (a && b && currentSection) {
      entries.push({ _section: currentSection, key: a, value: b });
    }
  }
  return entries;
}

// Parse KPI Ramp tab with section headers
function parseKpiRamp(raw: unknown[][]): KPIRow[] {
  const rows: KPIRow[] = [];
  let currentSection = '';
  let headers: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] as string[];
    const a = String(row[0] ?? '').trim();

    // Section headers start with === or contain #ERROR! (merged cell artifacts)
    if (a.includes('#ERROR!') || a.startsWith('===')) {
      // Next row should be column headers
      continue;
    }
    // Header row detection
    if (a === 'Metric') {
      headers = row.map(c => String(c ?? '').trim());
      // Determine section from previous rows
      const prev = String((raw[i - 1] as string[])?.[0] ?? '').trim();
      if (prev.includes('#ERROR!')) {
        // Use position to determine section
        if (rows.length === 0) currentSection = 'PRIMARY KPIs';
        else if (rows.some(r => r._section === 'PRIMARY KPIs') && !rows.some(r => r._section === 'FIRE LEAD KPIs')) currentSection = 'FIRE LEAD KPIs';
        else currentSection = 'ACTIVITY KPIs';
      }
      continue;
    }
    // Skip empty rows, definition rows, TODO rows
    if (!a || a.startsWith('---') || !headers.length) continue;
    // Data row
    if (headers[0] === 'Metric' && a !== 'Metric') {
      const obj: Record<string, string> = {};
      headers.forEach((h, j) => {
        obj[h] = String(row[j] ?? '').trim();
      });
      rows.push({
        ...obj,
        _section: currentSection,
        _row: i + 1,
      } as unknown as KPIRow);
    }
  }
  return rows;
}

export function useSheetData() {
  const [dailyPlan, setDailyPlan] = useState<DailyTask[]>(mockDailyPlan);
  const [toolAccess, setToolAccess] = useState<ToolAccess[]>(mockToolAccess);
  const [kpiRamp, setKpiRamp] = useState<KPIRow[]>(mockKpiRamp);
  const [trainingLog, setTrainingLog] = useState<TrainingModule[]>(mockTrainingLog);
  const [quickRef, setQuickRef] = useState<QuickRefEntry[]>(mockQuickRef);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!APPS_SCRIPT_URL) {
      // Use mock data in dev
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [dpRaw, taRaw, kpiRaw, tlRaw, qrRaw] = await Promise.all([
        fetchTab({ tab: 'Daily Plan' }),
        fetchTab({ tab: 'Tool Access Checklist' }),
        fetchTab({ tab: 'KPI Ramp' }),
        fetchTab({ tab: 'Training Log' }),
        fetchTab({ tab: 'Quick Reference' }),
      ]);

      // Daily Plan: skip row 2 (blank) and row 3 (section header)
      // Filter out section headers and blank rows
      const dpParsed = parseRows<DailyTask>(dpRaw).filter(r => r.Day && r.Task);
      setDailyPlan(dpParsed);

      const taParsed = parseRows<ToolAccess>(taRaw);
      setToolAccess(taParsed);

      setKpiRamp(parseKpiRamp(kpiRaw));

      const tlParsed = parseRows<TrainingModule>(tlRaw).filter(r => r.Module && !r.Module.startsWith('---'));
      setTrainingLog(tlParsed);

      setQuickRef(parseQuickRef(qrRaw));

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const updateTaskStatus = useCallback(async (task: DailyTask, newStatus: DailyTask['Status']) => {
    // Optimistic update
    setDailyPlan(prev => prev.map(t => t._row === task._row ? { ...t, Status: newStatus } : t));
    if (APPS_SCRIPT_URL) {
      try {
        await updateCell({ tab: 'Daily Plan', row: task._row, col: 6, value: newStatus });
      } catch {
        // Revert on failure
        setDailyPlan(prev => prev.map(t => t._row === task._row ? { ...t, Status: task.Status } : t));
      }
    }
  }, []);

  const updateTrainingCompleted = useCallback(async (mod: TrainingModule, completed: string) => {
    setTrainingLog(prev => prev.map(t => t._row === mod._row ? { ...t, Completed: completed } : t));
    if (APPS_SCRIPT_URL) {
      try {
        await updateCell({ tab: 'Training Log', row: mod._row, col: 5, value: completed });
      } catch {
        setTrainingLog(prev => prev.map(t => t._row === mod._row ? { ...t, Completed: mod.Completed } : t));
      }
    }
  }, []);

  const updateToolStatus = useCallback(async (tool: ToolAccess, newStatus: string) => {
    setToolAccess(prev => prev.map(t => t._row === tool._row ? { ...t, Status: newStatus } : t));
    if (APPS_SCRIPT_URL) {
      try {
        await updateCell({ tab: 'Tool Access Checklist', row: tool._row, col: 5, value: newStatus });
      } catch {
        setToolAccess(prev => prev.map(t => t._row === tool._row ? { ...t, Status: tool.Status } : t));
      }
    }
  }, []);

  const updateKPIActual = useCallback(async (kpi: KPIRow, weekNum: number, value: string) => {
    const actualKey = `Week ${weekNum} Actual` as keyof KPIRow;
    setKpiRamp(prev => prev.map(k => k._row === kpi._row ? { ...k, [actualKey]: value } : k));
    if (APPS_SCRIPT_URL) {
      const col = 2 + (weekNum - 1) * 2 + 1; // Week 1 Actual = col 3, Week 2 Actual = col 5, etc.
      try {
        await updateCell({ tab: 'KPI Ramp', row: kpi._row, col, value });
      } catch {
        setKpiRamp(prev => prev.map(k => k._row === kpi._row ? { ...k, [actualKey]: (kpi as unknown as Record<string, string>)[actualKey] } : k));
      }
    }
  }, []);

  return {
    dailyPlan, toolAccess, kpiRamp, trainingLog, quickRef,
    loading, error,
    updateTaskStatus, updateTrainingCompleted, updateToolStatus, updateKPIActual,
    refresh: loadData,
  };
}
