import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Users, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getAllSessions, type Session } from '../lib/storage';

interface UserStats {
  userId: string;
  userName: string;
  totalCalls: number;
  totalMinutes: number;
  avgScore: number;
  scores: { date: string; overall: number }[];
  recentSessions: Session[];
  bestScore: number;
  worstScore: number;
  byDifficulty: Record<string, { count: number; avg: number }>;
  byType: Record<string, { count: number; avg: number }>;
}

function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const color =
    score >= 8 ? 'text-emerald-600 bg-emerald-50' : score >= 6 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
  const sizeClass = size === 'lg' ? 'text-2xl px-4 py-1.5' : size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-0.5';
  return (
    <span className={`inline-flex items-center rounded-full font-bold ${color} ${sizeClass}`}>
      {typeof score === 'number' ? score.toFixed(1) : score}
    </span>
  );
}

function TrendArrow({ sessions }: { sessions: { date: string; overall: number }[] }) {
  if (sessions.length < 3) return null;
  const recent = sessions.slice(0, 3).reduce((s, x) => s + x.overall, 0) / 3;
  const older = sessions.slice(-3).reduce((s, x) => s + x.overall, 0) / Math.min(3, sessions.slice(-3).length);
  const diff = recent - older;
  if (Math.abs(diff) < 0.3) return <span className="text-gray-400 text-xs">—</span>;
  return diff > 0
    ? <span className="text-emerald-500 text-xs font-semibold">+{diff.toFixed(1)}</span>
    : <span className="text-red-500 text-xs font-semibold">{diff.toFixed(1)}</span>;
}

export default function AdminStats() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  useEffect(() => {
    getAllSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const userStats = useMemo((): UserStats[] => {
    const byUser = new Map<string, Session[]>();
    for (const s of sessions) {
      const key = s.userId;
      if (!byUser.has(key)) byUser.set(key, []);
      byUser.get(key)!.push(s);
    }

    return Array.from(byUser.entries()).map(([userId, userSessions]) => {
      const reviewed = userSessions.filter(s => s.review);
      const scores = reviewed.map(s => ({ date: s.date, overall: s.review!.overall }));
      const avgScore = scores.length > 0 ? scores.reduce((s, x) => s + x.overall, 0) / scores.length : 0;

      const byDifficulty: Record<string, { count: number; total: number }> = {};
      const byType: Record<string, { count: number; total: number }> = {};
      for (const s of reviewed) {
        const d = s.difficulty;
        if (!byDifficulty[d]) byDifficulty[d] = { count: 0, total: 0 };
        byDifficulty[d].count++;
        byDifficulty[d].total += s.review!.overall;

        const t = s.scenarioType;
        if (!byType[t]) byType[t] = { count: 0, total: 0 };
        byType[t].count++;
        byType[t].total += s.review!.overall;
      }

      return {
        userId,
        userName: userSessions[0].userName || 'Unknown',
        totalCalls: userSessions.length,
        totalMinutes: Math.round(userSessions.reduce((s, x) => s + x.duration, 0) / 60),
        avgScore,
        scores,
        recentSessions: userSessions.slice(0, 5),
        bestScore: scores.length > 0 ? Math.max(...scores.map(s => s.overall)) : 0,
        worstScore: scores.length > 0 ? Math.min(...scores.map(s => s.overall)) : 0,
        byDifficulty: Object.fromEntries(
          Object.entries(byDifficulty).map(([k, v]) => [k, { count: v.count, avg: v.total / v.count }])
        ),
        byType: Object.fromEntries(
          Object.entries(byType).map(([k, v]) => [k, { count: v.count, avg: v.total / v.count }])
        ),
      };
    }).sort((a, b) => b.totalCalls - a.totalCalls);
  }, [sessions]);

  // Totals
  const totalCalls = sessions.length;
  const totalMinutes = Math.round(sessions.reduce((s, x) => s + x.duration, 0) / 60);
  const reviewed = sessions.filter(s => s.review);
  const overallAvg = reviewed.length > 0
    ? (reviewed.reduce((s, x) => s + (x.review?.overall || 0), 0) / reviewed.length).toFixed(1)
    : '—';

  const diffColors: Record<string, string> = {
    friendly: 'bg-emerald-100 text-emerald-700',
    neutral: 'bg-amber-100 text-amber-700',
    tough: 'bg-red-100 text-red-700',
  };

  return (
    <div className="min-h-screen bg-warm">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/call-trainer" className="p-2 rounded-lg hover:bg-white/60 transition-colors">
            <ArrowLeft size={20} className="text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-navy">Team Performance</h1>
            <p className="text-gray-400 text-sm">Call Trainer stats across all users</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <Loader2 size={32} className="text-gray-300 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-20">
            <Users size={48} className="text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400">No sessions recorded yet</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <div className="text-3xl font-extrabold text-navy">{totalCalls}</div>
                <div className="text-xs text-gray-400 font-medium mt-1">Total Calls</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <div className="text-3xl font-extrabold text-navy">{totalMinutes}m</div>
                <div className="text-xs text-gray-400 font-medium mt-1">Practice Time</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <div className="text-3xl font-extrabold text-navy">{overallAvg}</div>
                <div className="text-xs text-gray-400 font-medium mt-1">Avg Score</div>
              </div>
            </div>

            {/* Per-user breakdown */}
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">By User</h2>
            <div className="space-y-3">
              {userStats.map((u) => (
                <div key={u.userId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedUser(expandedUser === u.userId ? null : u.userId)}
                    className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-navy/10 flex items-center justify-center text-sm font-bold text-navy shrink-0">
                      {u.userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-sm">{u.userName}</div>
                      <div className="text-xs text-gray-400">
                        {u.totalCalls} call{u.totalCalls !== 1 ? 's' : ''} — {u.totalMinutes}m practice
                      </div>
                    </div>
                    <TrendArrow sessions={u.scores} />
                    {u.avgScore > 0 && <ScoreBadge score={u.avgScore} />}
                    {expandedUser === u.userId ? (
                      <ChevronUp size={18} className="text-gray-300" />
                    ) : (
                      <ChevronDown size={18} className="text-gray-300" />
                    )}
                  </button>

                  {expandedUser === u.userId && (
                    <div className="border-t border-gray-100 px-5 py-4 space-y-5">
                      {/* Score range */}
                      <div className="flex gap-6">
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Best</div>
                          <ScoreBadge score={u.bestScore} size="sm" />
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Worst</div>
                          <ScoreBadge score={u.worstScore} size="sm" />
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Average</div>
                          <ScoreBadge score={u.avgScore} size="sm" />
                        </div>
                      </div>

                      {/* By difficulty */}
                      {Object.keys(u.byDifficulty).length > 0 && (
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">By Difficulty</div>
                          <div className="flex gap-2 flex-wrap">
                            {Object.entries(u.byDifficulty).map(([diff, stats]) => (
                              <span key={diff} className={`text-xs px-2.5 py-1 rounded-full font-medium ${diffColors[diff] || 'bg-gray-100 text-gray-600'}`}>
                                {diff}: {stats.avg.toFixed(1)} ({stats.count})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* By type */}
                      {Object.keys(u.byType).length > 0 && (
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">By Scenario</div>
                          <div className="flex gap-2 flex-wrap">
                            {Object.entries(u.byType).map(([type, stats]) => (
                              <span key={type} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                                {type}: {stats.avg.toFixed(1)} ({stats.count})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recent sessions with feedback */}
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Recent Sessions</div>
                        <div className="space-y-2">
                          {u.recentSessions.map((s) => (
                            <div key={s.id} className="bg-warm rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-semibold text-gray-700">{s.characterName}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${diffColors[s.difficulty]}`}>
                                  {s.difficulty}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  {new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                                {s.review && <ScoreBadge score={s.review.overall} size="sm" />}
                              </div>
                              {s.review && (
                                <div className="space-y-1">
                                  {s.review.strengths.slice(0, 2).map((str, i) => (
                                    <p key={`s-${i}`} className="text-[11px] text-emerald-700">+ {str}</p>
                                  ))}
                                  {s.review.improvements.slice(0, 2).map((imp, i) => (
                                    <p key={`i-${i}`} className="text-[11px] text-amber-700">- {imp}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
