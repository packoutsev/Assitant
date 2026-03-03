import { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import ScenarioSelect from './components/ScenarioSelect';
import CallScreen from './components/CallScreen';
import ReviewScreen from './components/ReviewScreen';
import SessionHistory from './components/SessionHistory';
import type { ScenarioType, Difficulty } from './scenarios';
import type { TranscriptEntry, CallReview } from './lib/storage';

interface CallResult {
  scenarioType: ScenarioType;
  difficulty: Difficulty;
  characterName: string;
  transcript: TranscriptEntry[];
  duration: number;
}

function App() {
  const [callResult, setCallResult] = useState<CallResult | null>(null);

  return (
    <Routes>
      <Route path="/" element={<ScenarioSelect />} />
      <Route
        path="/call/:type/:difficulty"
        element={<CallScreen onCallEnd={setCallResult} />}
      />
      <Route
        path="/review"
        element={<ReviewScreen callResult={callResult} />}
      />
      <Route path="/history" element={<SessionHistory />} />
      <Route path="/history/:id" element={<SessionHistory />} />
    </Routes>
  );
}

export default App;
