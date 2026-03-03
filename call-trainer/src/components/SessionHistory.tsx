import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, ChevronDown, ChevronUp, Phone } from 'lucide-react';
import { getSessions, deleteSession, type Session } from '../lib/storage';

const difficultyColors: Record<string, string> = {
  friendly: 'bg-emerald-100 text-emerald-700',
  neutral: 'bg-amber-100 text-amber-700',
  tough: 'bg-red-100 text-red-700',
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? 'text-emerald-600 bg-emerald-50' : score >= 6 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold ${color}`}>
      {score}
    </span>
  );
}

export default function SessionHistory() {
  const navigate = useNavigate();
  const { id: expandedId } = useParams<{ id?: string }>();
  const [sessions, setSessions] = useState<Session[]>(getSessions);
  const [expanded, setExpanded] = useState<string | null>(expandedId || null);

  function handleDelete(id: string) {
    deleteSession(id);
    setSessions(getSessions());
    if (expanded === id) setExpanded(null);
  }

  function toggleExpand(id: string) {
    setExpanded(expanded === id ? null : id);
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatDuration(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Average scores
  const reviewedSessions = sessions.filter((s) => s.review);
  const avgScore =
    reviewedSessions.length > 0
      ? (reviewedSessions.reduce((sum, s) => sum + (s.review?.overall || 0), 0) / reviewedSessions.length).toFixed(1)
      : null;

  return (
    <div className="min-h-screen bg-warm">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-warm-dark transition-colors"
          >
            <ArrowLeft size={20} className="text-navy/60" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-navy">Session History</h1>
            <p className="text-navy/50 text-sm">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              {avgScore && ` — avg score: ${avgScore}`}
            </p>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-20">
            <Phone size={48} className="text-navy/20 mx-auto mb-4" />
            <p className="text-navy/50 mb-4">No practice calls yet</p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-navy text-white rounded-xl font-semibold hover:bg-navy-light"
            >
              Start Practicing
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className="bg-white rounded-xl border border-warm-dark overflow-hidden">
                {/* Session summary row */}
                <button
                  onClick={() => toggleExpand(session.id)}
                  className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-warm/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-navy text-sm">{session.characterName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${difficultyColors[session.difficulty]}`}>
                        {session.difficulty}
                      </span>
                    </div>
                    <div className="text-xs text-navy/40">
                      {formatDate(session.date)} — {formatDuration(session.duration)}
                    </div>
                  </div>
                  {session.review && <ScoreBadge score={session.review.overall} />}
                  {expanded === session.id ? (
                    <ChevronUp size={18} className="text-navy/30" />
                  ) : (
                    <ChevronDown size={18} className="text-navy/30" />
                  )}
                </button>

                {/* Expanded details */}
                {expanded === session.id && (
                  <div className="border-t border-warm-dark px-5 py-4 space-y-4">
                    {session.review && (
                      <>
                        {/* Scores */}
                        <div className="grid grid-cols-5 gap-2">
                          {Object.entries(session.review.scores).map(([key, val]) => (
                            <div key={key} className="text-center">
                              <div className="text-lg font-bold text-navy">{val}</div>
                              <div className="text-[10px] text-navy/40 uppercase tracking-wide">
                                {key === 'valueProp' ? 'Value' : key}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Feedback */}
                        <div className="space-y-2">
                          {session.review.strengths.map((s, i) => (
                            <p key={`s-${i}`} className="text-xs text-emerald-700 bg-emerald-50 rounded px-3 py-1.5">
                              + {s}
                            </p>
                          ))}
                          {session.review.improvements.map((s, i) => (
                            <p key={`i-${i}`} className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-1.5">
                              - {s}
                            </p>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Transcript */}
                    <div className="bg-warm rounded-lg p-3 max-h-60 overflow-y-auto">
                      {session.transcript.map((entry, i) => (
                        <div key={i} className="flex gap-2 mb-2">
                          <span
                            className={`text-[10px] font-semibold mt-0.5 w-10 shrink-0 ${
                              entry.role === 'user' ? 'text-blue-600' : 'text-emerald-600'
                            }`}
                          >
                            {entry.role === 'user' ? 'You' : session.characterName.split(' ')[0]}
                          </span>
                          <p className="text-xs text-navy/60 leading-relaxed">{entry.text}</p>
                        </div>
                      ))}
                    </div>

                    {/* Delete */}
                    <div className="flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(session.id);
                        }}
                        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
