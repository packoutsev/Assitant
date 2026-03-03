import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { CleaningSheet } from '../types';

const COLLECTION = 'cleaning_sheets';

function toSheet(id: string, data: Record<string, unknown>): CleaningSheet {
  return {
    id,
    customer: (data.customer as string) || '',
    address: (data.address as string) || '',
    claim_number: (data.claim_number as string) || '',
    cleaning_type: (data.cleaning_type as CleaningSheet['cleaning_type']) || 'fire',
    rooms: (data.rooms as CleaningSheet['rooms']) || [],
    status: (data.status as CleaningSheet['status']) || 'draft',
    created_by: (data.created_by as string) || '',
    created_at: data.created_at instanceof Timestamp ? data.created_at.toMillis() : (data.created_at as number) || Date.now(),
    updated_at: data.updated_at instanceof Timestamp ? data.updated_at.toMillis() : (data.updated_at as number) || Date.now(),
  };
}

export function useCleaningSheets() {
  const [sheets, setSheets] = useState<CleaningSheet[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, COLLECTION), orderBy('updated_at', 'desc'));
      const snap = await getDocs(q);
      setSheets(snap.docs.map(d => toSheet(d.id, d.data())));
    } catch (err) {
      console.error('Failed to load cleaning sheets:', err);
      // Fallback: fetch without ordering (index may not exist yet)
      try {
        const snap = await getDocs(collection(db, COLLECTION));
        const docs = snap.docs.map(d => toSheet(d.id, d.data()));
        docs.sort((a, b) => b.updated_at - a.updated_at);
        setSheets(docs);
      } catch (err2) {
        console.error('Fallback fetch also failed:', err2);
        setSheets([]);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { sheets, loading, refresh };
}

export function useCleaningSheet(sheetId: string | null) {
  const [sheet, setSheet] = useState<CleaningSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load sheet
  useEffect(() => {
    if (!sheetId) { setSheet(null); setLoading(false); return; }
    setLoading(true);
    getDoc(doc(db, COLLECTION, sheetId)).then(snap => {
      if (snap.exists()) {
        setSheet(toSheet(snap.id, snap.data()));
      } else {
        setSheet(null);
      }
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load sheet:', err);
      setSheet(null);
      setLoading(false);
    });
  }, [sheetId]);

  // Auto-save with debounce
  const save = useCallback(async (updated: CleaningSheet) => {
    setSheet(updated);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const { id, ...data } = updated;
        await setDoc(doc(db, COLLECTION, id), {
          ...data,
          updated_at: serverTimestamp(),
        });
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
      setSaving(false);
    }, 800);
  }, []);

  // Immediate save (for navigation away)
  const saveNow = useCallback(async (updated: CleaningSheet) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    setSheet(updated);
    try {
      const { id, ...data } = updated;
      await setDoc(doc(db, COLLECTION, id), {
        ...data,
        updated_at: serverTimestamp(),
      });
    } catch (err) {
      console.error('Save failed:', err);
    }
    setSaving(false);
  }, []);

  const create = useCallback(async (initial: Omit<CleaningSheet, 'id' | 'created_at' | 'updated_at'>) => {
    const ref = doc(collection(db, COLLECTION));
    const now = Date.now();
    const newSheet: CleaningSheet = {
      ...initial,
      id: ref.id,
      created_at: now,
      updated_at: now,
    };
    // Set local state first so UI is responsive
    setSheet(newSheet);
    // Then persist — if this fails, we still have local state
    try {
      await setDoc(ref, {
        ...initial,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to save new sheet to Firestore:', err);
    }
    return newSheet;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(doc(db, COLLECTION, id));
    setSheet(null);
  }, []);

  return { sheet, loading, saving, save, saveNow, create, remove };
}
