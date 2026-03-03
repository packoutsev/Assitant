import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ScenarioSelect from './components/ScenarioSelect';
import CallScreen from './components/CallScreen';
import ReviewScreen from './components/ReviewScreen';
import SessionHistory from './components/SessionHistory';
import AdminStats from './components/AdminStats';
import { migrateLocalStorage } from './lib/storage';
import type { CallResult } from './components/CallScreen';

export default function CallTrainer() {
  const { user, profile } = useAuth();
  const [callResult, setCallResult] = useState<CallResult | null>(null);

  // One-time: migrate any localStorage sessions to Firestore
  useEffect(() => {
    if (user?.uid) {
      migrateLocalStorage(user.uid, profile?.name || user.email || 'Unknown');
    }
  }, [user, profile]);

  return (
    <Routes>
      <Route index element={<ScenarioSelect />} />
      <Route path="call/:type/:difficulty" element={<CallScreen onCallEnd={setCallResult} />} />
      <Route path="review" element={<ReviewScreen callResult={callResult} />} />
      <Route path="history" element={<SessionHistory />} />
      <Route path="history/:id" element={<SessionHistory />} />
      <Route path="stats" element={<AdminStats />} />
    </Routes>
  );
}
