import {
  collection, doc, setDoc, getDocs, deleteDoc, query, where, orderBy, limit,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { ScenarioType, Difficulty } from '../scenarios';

export interface CallReview {
  scores: {
    opening: number;
    discovery: number;
    valueProp: number;
    close: number;
    objections: number;
  };
  overall: number;
  strengths: string[];
  improvements: string[];
  alternatives: string[];
}

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface Session {
  id: string;
  userId: string;
  userName: string;
  date: string;
  scenarioType: ScenarioType;
  difficulty: Difficulty;
  characterName: string;
  transcript: TranscriptEntry[];
  review: CallReview | null;
  duration: number;
}

const COLLECTION = 'call_trainer_sessions';

function sessionFromDoc(data: DocumentData, id: string): Session {
  return {
    id,
    userId: data.userId,
    userName: data.userName || '',
    date: data.date,
    scenarioType: data.scenarioType,
    difficulty: data.difficulty,
    characterName: data.characterName,
    transcript: data.transcript || [],
    review: data.review || null,
    duration: data.duration || 0,
  };
}

export async function getSessions(userId: string): Promise<Session[]> {
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    orderBy('date', 'desc'),
    limit(100),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => sessionFromDoc(d.data(), d.id));
}

export async function getAllSessions(): Promise<Session[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('date', 'desc'),
    limit(200),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => sessionFromDoc(d.data(), d.id));
}

export async function saveSession(session: Session): Promise<void> {
  await setDoc(doc(db, COLLECTION, session.id), session);
}

export async function deleteSession(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// One-time migration: move localStorage sessions to Firestore
const LS_KEY = 'call-trainer-sessions';
const LS_MIGRATED_KEY = 'call-trainer-migrated';

export async function migrateLocalStorage(userId: string, userName: string): Promise<number> {
  if (localStorage.getItem(LS_MIGRATED_KEY)) return 0;

  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      localStorage.setItem(LS_MIGRATED_KEY, '1');
      return 0;
    }

    const oldSessions: Omit<Session, 'userId' | 'userName'>[] = JSON.parse(raw);
    let migrated = 0;

    for (const old of oldSessions) {
      const session: Session = {
        ...old,
        userId,
        userName,
      };
      await setDoc(doc(db, COLLECTION, session.id), session);
      migrated++;
    }

    localStorage.setItem(LS_MIGRATED_KEY, '1');
    return migrated;
  } catch {
    return 0;
  }
}
