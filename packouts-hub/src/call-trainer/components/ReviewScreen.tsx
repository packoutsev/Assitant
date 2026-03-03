import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Star, TrendingUp, AlertTriangle, MessageSquare, Loader2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import type { CallResult } from './CallScreen';
import type { CallReview, Session } from '../lib/storage';
import { saveSession, generateId } from '../lib/storage';
import { fetchReview } from '../lib/api';

interface Props {
  callResult: CallResult | null;
}

const scoreLabels: Record<string, string> = {
  opening: 'Opening',
  discovery: 'Discovery',
  valueProp: 'Value Prop',
  close: 'Close',
  objections: 'Objections',
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color =
    score >= 8 ? 'bg-emerald-500' : score >= 6 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${color}`}
          style={{ width: `${score * 10}%` }}
        />
      </div>
      <span className="text-sm font-bold text-gray-800 w-8 text-right">{score}</span>
    </div>
  );
}

export default function ReviewScreen({ callResult }: Props) {
  const { user, profile } = useAuth();
  const [review, setReview] = useState<CallReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callResult || callResult.transcript.length === 0) {
      setLoading(false);
      return;
    }

    async function doReview() {
      try {
        const transcriptText = callResult!.transcript
          .map((t) => `${t.role === 'user' ? 'Caller' : callResult!.characterName}: ${t.text}`)
          .join('\n');

        const scenarioLabel = `${callResult!.scenarioType} (${callResult!.difficulty} difficulty) — ${callResult!.characterName}`;
        const data: CallReview = await fetchReview(transcriptText, scenarioLabel);
        setReview(data);

        const session: Session = {
          id: generateId(),
          userId: user?.uid || 'anonymous',
          userName: profile?.name || user?.email || 'Unknown',
          date: new Date().toISOString(),
          scenarioType: callResult!.scenarioType,
          difficulty: callResult!.difficulty,
          characterName: callResult!.characterName,
          transcript: callResult!.transcript,
          review: data,
          duration: callResult!.duration,
        };
        await saveSession(session);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Review failed');
      } finally {
        setLoading(false);
      }
    }

    doReview();
  }, [callResult]);

  if (!callResult) {
    return (
      <div className="min-h-screen bg-warm flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">No call to review</p>
          <Link to="/call-trainer" className="px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light">
            Back to Scenarios
          </Link>
        </div>
      </div>
    );
  }

  function formatDuration(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }

  return (
    <div className="min-h-screen bg-warm">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/call-trainer" className="p-2 rounded-lg hover:bg-white/60 transition-colors">
            <ArrowLeft size={20} className="text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-navy">Call Review</h1>
            <p className="text-gray-400 text-sm">
              {callResult.characterName} — {callResult.scenarioType} ({callResult.difficulty}) — {formatDuration(callResult.duration)}
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-4 py-20">
            <Loader2 size={40} className="text-gray-300 animate-spin" />
            <p className="text-gray-400">Analyzing your call...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-700 font-medium">{error}</p>
            <Link to="/call-trainer" className="mt-4 inline-block px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy-light">
              Try Again
            </Link>
          </div>
        )}

        {review && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <div className="text-6xl font-extrabold text-navy mb-1">{review.overall}</div>
              <div className="text-gray-400 text-sm font-medium">Overall Score</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Star size={16} className="text-gold" />
                Score Breakdown
              </h3>
              <div className="space-y-3">
                {Object.entries(review.scores).map(([key, value]) => (
                  <ScoreBar key={key} label={scoreLabels[key] || key} score={value} />
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-600" />
                What You Did Well
              </h3>
              <ul className="space-y-2">
                {review.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-emerald-500 shrink-0">+</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                Areas to Improve
              </h3>
              <ul className="space-y-2">
                {review.improvements.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-amber-500 shrink-0">-</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            {review.alternatives.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <MessageSquare size={16} className="text-blue-600" />
                  Better Phrasing
                </h3>
                <ul className="space-y-2">
                  {review.alternatives.map((s, i) => (
                    <li key={i} className="text-sm text-gray-600 bg-blue-50 rounded-lg p-3 border border-blue-100">
                      "{s}"
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-base font-bold text-gray-800 mb-3">Full Transcript</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {callResult.transcript.map((entry, i) => (
                  <div key={i} className="flex gap-3">
                    <span className={`text-xs font-semibold mt-0.5 shrink-0 w-16 ${
                      entry.role === 'user' ? 'text-blue-600' : 'text-emerald-600'
                    }`}>
                      {entry.role === 'user' ? 'You' : callResult.characterName.split(' ')[0]}
                    </span>
                    <p className="text-sm text-gray-500 leading-relaxed">{entry.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4 justify-center pb-8">
              <Link
                to="/call-trainer"
                className="px-6 py-3 bg-navy text-white rounded-xl font-semibold hover:bg-navy-light transition-colors"
              >
                New Call
              </Link>
              <Link
                to="/call-trainer/history"
                className="px-6 py-3 bg-white border border-gray-200 text-navy rounded-xl font-semibold hover:border-navy/30 transition-colors"
              >
                View History
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && !review && callResult.transcript.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-4">No transcript recorded — the call was too short to review.</p>
            <Link to="/call-trainer" className="px-6 py-3 bg-navy text-white rounded-xl font-semibold hover:bg-navy-light">
              Try Again
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
