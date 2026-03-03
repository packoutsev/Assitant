import { useState, useEffect, useCallback } from 'react';
import type { ScopeItem, OrderItem, Decision, Measurement, SubContact, SubLogEntry, DailyLogEntry, PunchItem, Photo, BudgetLineItem, TaskStatus, OrderStatus, DecisionStatus, PunchStatus } from '../types';
import { mockScope, mockOrders, mockDecisions, mockMeasurements, mockSubs, mockSubLog, mockDailyLog, mockPunchList, mockBudget } from '../api/mockData';
import { fetchTab, updateCell, appendRow, parseRows, isLiveMode } from '../api/sheets';

interface SheetData {
  loading: boolean;
  scope: ScopeItem[];
  orders: OrderItem[];
  decisions: Decision[];
  measurements: Measurement[];
  subs: SubContact[];
  subLog: SubLogEntry[];
  dailyLog: DailyLogEntry[];
  punchList: PunchItem[];
  budget: BudgetLineItem[];
  photos: Photo[];
  updateScopeStatus: (item: ScopeItem, newStatus: TaskStatus) => void;
  updateOrderStatus: (item: OrderItem, newStatus: OrderStatus) => void;
  updateDecisionStatus: (item: Decision, newStatus: DecisionStatus, choice: string) => void;
  updateMeasurement: (item: Measurement, value: string) => void;
  updateSub: (item: SubContact, field: keyof SubContact, value: string) => void;
  addSubLogEntry: (entry: Omit<SubLogEntry, '_row'>) => void;
  addDailyLogEntry: (entry: Omit<DailyLogEntry, '_row'>) => void;
  addPunchItem: (item: Omit<PunchItem, '_row'>) => void;
  updatePunchStatus: (item: PunchItem, newStatus: PunchStatus) => void;
  addPhoto: (photo: Photo) => void;
  deletePhoto: (id: string) => void;
  updateBudgetActual: (item: BudgetLineItem, actual: number) => void;
}

const PHOTOS_KEY = 'remodel-photos';

function loadPhotos(): Photo[] {
  try {
    const stored = localStorage.getItem(PHOTOS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function savePhotos(photos: Photo[]) {
  try {
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
  } catch (e) {
    console.error('Failed to save photos to localStorage', e);
  }
}

export function useSheetData(): SheetData {
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<ScopeItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [subs, setSubs] = useState<SubContact[]>([]);
  const [subLog, setSubLog] = useState<SubLogEntry[]>([]);
  const [dailyLog, setDailyLog] = useState<DailyLogEntry[]>([]);
  const [punchList, setPunchList] = useState<PunchItem[]>([]);
  const [budget, setBudget] = useState<BudgetLineItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>(loadPhotos);

  useEffect(() => {
    async function load() {
      if (!isLiveMode()) {
        setScope(mockScope);
        setOrders(mockOrders);
        setDecisions(mockDecisions);
        setMeasurements(mockMeasurements);
        setSubs(mockSubs);
        setSubLog(mockSubLog);
        setDailyLog(mockDailyLog);
        setPunchList(mockPunchList);
        setBudget(mockBudget);
        setLoading(false);
        return;
      }

      try {
        const [scopeRaw, ordersRaw, decisionsRaw, measRaw, subsRaw, subLogRaw, dailyRaw, punchRaw, budgetRaw] = await Promise.all([
          fetchTab({ tab: 'Scope of Work' }),
          fetchTab({ tab: 'Orders' }),
          fetchTab({ tab: 'Decisions' }),
          fetchTab({ tab: 'Measurements' }),
          fetchTab({ tab: 'Subs' }),
          fetchTab({ tab: 'Sub Log' }),
          fetchTab({ tab: 'Daily Log' }),
          fetchTab({ tab: 'Punch List' }),
          fetchTab({ tab: 'Budget' }),
        ]);

        if (scopeRaw) setScope(parseRows<ScopeItem>(scopeRaw));
        if (ordersRaw) setOrders(parseRows<OrderItem>(ordersRaw));
        if (decisionsRaw) setDecisions(parseRows<Decision>(decisionsRaw));
        if (measRaw) setMeasurements(parseRows<Measurement>(measRaw));
        if (subsRaw) setSubs(parseRows<SubContact>(subsRaw));
        if (subLogRaw) setSubLog(parseRows<SubLogEntry>(subLogRaw));
        if (dailyRaw) setDailyLog(parseRows<DailyLogEntry>(dailyRaw));
        if (punchRaw) setPunchList(parseRows<PunchItem>(punchRaw));
        if (budgetRaw) setBudget(parseRows<BudgetLineItem>(budgetRaw));
      } catch (e) {
        console.error('Failed to load sheet data, falling back to mock', e);
        setScope(mockScope);
        setOrders(mockOrders);
        setDecisions(mockDecisions);
        setMeasurements(mockMeasurements);
        setSubs(mockSubs);
        setSubLog(mockSubLog);
        setDailyLog(mockDailyLog);
        setPunchList(mockPunchList);
        setBudget(mockBudget);
      }
      setLoading(false);
    }
    load();
  }, []);

  const updateScopeStatus = useCallback((item: ScopeItem, newStatus: TaskStatus) => {
    setScope(prev => prev.map(s => s._row === item._row ? { ...s, status: newStatus } : s));
    if (isLiveMode()) {
      updateCell({ tab: 'Scope of Work', row: item._row, col: 5, value: newStatus }).catch(() => {
        setScope(prev => prev.map(s => s._row === item._row ? { ...s, status: item.status } : s));
      });
    }
  }, []);

  const updateOrderStatus = useCallback((item: OrderItem, newStatus: OrderStatus) => {
    setOrders(prev => prev.map(o => o._row === item._row ? { ...o, status: newStatus } : o));
    if (isLiveMode()) {
      updateCell({ tab: 'Orders', row: item._row, col: 4, value: newStatus }).catch(() => {
        setOrders(prev => prev.map(o => o._row === item._row ? { ...o, status: item.status } : o));
      });
    }
  }, []);

  const updateDecisionStatus = useCallback((item: Decision, newStatus: DecisionStatus, choice: string) => {
    setDecisions(prev => prev.map(d => d._row === item._row ? { ...d, status: newStatus, choice } : d));
    if (isLiveMode()) {
      Promise.all([
        updateCell({ tab: 'Decisions', row: item._row, col: 3, value: newStatus }),
        updateCell({ tab: 'Decisions', row: item._row, col: 4, value: choice }),
      ]).catch(() => {
        setDecisions(prev => prev.map(d => d._row === item._row ? { ...d, status: item.status, choice: item.choice } : d));
      });
    }
  }, []);

  const updateMeasurement = useCallback((item: Measurement, value: string) => {
    setMeasurements(prev => prev.map(m => m._row === item._row ? { ...m, value } : m));
    if (isLiveMode()) {
      updateCell({ tab: 'Measurements', row: item._row, col: 4, value }).catch(() => {
        setMeasurements(prev => prev.map(m => m._row === item._row ? { ...m, value: item.value } : m));
      });
    }
  }, []);

  const updateSub = useCallback((item: SubContact, field: keyof SubContact, value: string) => {
    setSubs(prev => prev.map(s => s._row === item._row ? { ...s, [field]: value } : s));
    const colMap: Record<string, number> = { trade: 1, name: 2, company: 3, phone: 4, email: 5, notes: 6 };
    if (isLiveMode() && colMap[field]) {
      updateCell({ tab: 'Subs', row: item._row, col: colMap[field], value }).catch(() => {
        setSubs(prev => prev.map(s => s._row === item._row ? { ...s, [field]: item[field] } : s));
      });
    }
  }, []);

  const addSubLogEntry = useCallback((entry: Omit<SubLogEntry, '_row'>) => {
    const newEntry = { ...entry, _row: subLog.length + 2 } as SubLogEntry;
    setSubLog(prev => [newEntry, ...prev]);
    if (isLiveMode()) {
      appendRow({ tab: 'Sub Log', values: [entry.date, entry.trade, entry.contact, entry.notes, entry.followUp, entry.quoteAmount] });
    }
  }, [subLog.length]);

  const addDailyLogEntry = useCallback((entry: Omit<DailyLogEntry, '_row'>) => {
    const newEntry = { ...entry, _row: dailyLog.length + 2 } as DailyLogEntry;
    setDailyLog(prev => [newEntry, ...prev]);
    if (isLiveMode()) {
      appendRow({ tab: 'Daily Log', values: [entry.date, entry.entry] });
    }
  }, [dailyLog.length]);

  const addPunchItem = useCallback((item: Omit<PunchItem, '_row'>) => {
    const newItem = { ...item, _row: punchList.length + 2 } as PunchItem;
    setPunchList(prev => [newItem, ...prev]);
    if (isLiveMode()) {
      appendRow({ tab: 'Punch List', values: [item.item, item.zone, item.status, item.photo, item.notes] });
    }
  }, [punchList.length]);

  const updatePunchStatus = useCallback((item: PunchItem, newStatus: PunchStatus) => {
    setPunchList(prev => prev.map(p => p._row === item._row ? { ...p, status: newStatus } : p));
    if (isLiveMode()) {
      updateCell({ tab: 'Punch List', row: item._row, col: 3, value: newStatus }).catch(() => {
        setPunchList(prev => prev.map(p => p._row === item._row ? { ...p, status: item.status } : p));
      });
    }
  }, []);

  const addPhoto = useCallback((photo: Photo) => {
    setPhotos(prev => {
      const updated = [photo, ...prev];
      savePhotos(updated);
      return updated;
    });
  }, []);

  const deletePhoto = useCallback((id: string) => {
    setPhotos(prev => {
      const updated = prev.filter(p => p.id !== id);
      savePhotos(updated);
      return updated;
    });
  }, []);

  const updateBudgetActual = useCallback((item: BudgetLineItem, actual: number) => {
    setBudget(prev => prev.map(b => b._row === item._row ? { ...b, actual } : b));
    if (isLiveMode()) {
      updateCell({ tab: 'Budget', row: item._row, col: 6, value: String(actual) }).catch(() => {
        setBudget(prev => prev.map(b => b._row === item._row ? { ...b, actual: item.actual } : b));
      });
    }
  }, []);

  return {
    loading,
    scope,
    orders,
    decisions,
    measurements,
    subs,
    subLog,
    dailyLog,
    punchList,
    budget,
    photos,
    updateScopeStatus,
    updateOrderStatus,
    updateDecisionStatus,
    updateMeasurement,
    updateSub,
    addSubLogEntry,
    addDailyLogEntry,
    addPunchItem,
    updatePunchStatus,
    addPhoto,
    deletePhoto,
    updateBudgetActual,
  };
}
