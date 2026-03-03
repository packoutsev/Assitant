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
  date: string;
  scenarioType: ScenarioType;
  difficulty: Difficulty;
  characterName: string;
  transcript: TranscriptEntry[];
  review: CallReview | null;
  duration: number; // seconds
}

const STORAGE_KEY = 'call-trainer-sessions';

export function getSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSession(session: Session): void {
  const sessions = getSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function getSession(id: string): Session | undefined {
  return getSessions().find(s => s.id === id);
}

export function deleteSession(id: string): void {
  const sessions = getSessions().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
