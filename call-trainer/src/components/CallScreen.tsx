import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PhoneOff, Mic, MicOff } from 'lucide-react';
import { getScenario, type ScenarioType, type Difficulty } from '../scenarios';
import { connect, type RealtimeConnection } from '../lib/realtime';
import type { TranscriptEntry } from '../lib/storage';

interface Props {
  onCallEnd: (result: {
    scenarioType: ScenarioType;
    difficulty: Difficulty;
    characterName: string;
    transcript: TranscriptEntry[];
    duration: number;
  }) => void;
}

type CallStatus = 'connecting' | 'connected' | 'active' | 'ended';

export default function CallScreen({ onCallEnd }: Props) {
  const { type, difficulty } = useParams<{ type: ScenarioType; difficulty: Difficulty }>();
  const navigate = useNavigate();
  const scenario = getScenario(type as ScenarioType, difficulty as Difficulty);

  const [status, setStatus] = useState<CallStatus>('connecting');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const connectionRef = useRef<RealtimeConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Timer
  useEffect(() => {
    if (status === 'active') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  // Connect on mount
  useEffect(() => {
    let mounted = true;

    async function start() {
      try {
        const conn = await connect(scenario.systemPrompt, scenario.voice, {
          onTranscript: (entry) => {
            if (mounted) setTranscript((prev) => [...prev, entry]);
          },
          onStatusChange: (s) => {
            if (mounted) setStatus(s);
          },
          onError: (err) => {
            if (mounted) setError(err);
          },
        });
        if (mounted) {
          connectionRef.current = conn;
        } else {
          conn.disconnect();
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Connection failed');
      }
    }

    start();

    return () => {
      mounted = false;
      connectionRef.current?.disconnect();
    };
  }, [scenario]);

  const handleEndCall = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    setStatus('ended');

    onCallEnd({
      scenarioType: type as ScenarioType,
      difficulty: difficulty as Difficulty,
      characterName: scenario.characterName,
      transcript,
      duration: elapsed,
    });

    navigate('/review');
  }, [transcript, elapsed, type, difficulty, scenario.characterName, onCallEnd, navigate]);

  const toggleMute = useCallback(() => {
    const pc = connectionRef.current?.peerConnection;
    if (!pc) return;
    const senders = pc.getSenders();
    senders.forEach((sender) => {
      if (sender.track?.kind === 'audio') {
        sender.track.enabled = muted; // toggle
      }
    });
    setMuted(!muted);
  }, [muted]);

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  const statusLabels: Record<CallStatus, string> = {
    connecting: 'Connecting...',
    connected: 'Ringing...',
    active: scenario.characterName,
    ended: 'Call Ended',
  };

  return (
    <div className="min-h-screen bg-navy flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="text-white/60 text-sm">
          {scenario.label} — {difficulty}
        </div>
        <div className="text-white/80 font-mono text-lg">
          {formatTime(elapsed)}
        </div>
      </div>

      {/* Center: Avatar / Status */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        {/* Pulsing avatar */}
        <div className="relative">
          <div
            className={`w-28 h-28 rounded-full flex items-center justify-center text-3xl font-bold ${
              status === 'active'
                ? 'bg-emerald-500 text-white'
                : status === 'ended'
                ? 'bg-gray-500 text-white'
                : 'bg-amber-500 text-white'
            }`}
          >
            {scenario.characterName
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
          {status === 'active' && (
            <>
              <div className="absolute inset-0 rounded-full bg-emerald-500/40 animate-pulse-ring" />
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-pulse-ring [animation-delay:0.5s]" />
            </>
          )}
          {(status === 'connecting' || status === 'connected') && (
            <div className="absolute inset-0 rounded-full bg-amber-500/30 animate-pulse" />
          )}
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">{statusLabels[status]}</h2>
          {status === 'active' && (
            <p className="text-white/50 text-sm mt-1">{scenario.description}</p>
          )}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/40 rounded-lg px-4 py-2 text-red-300 text-sm max-w-md text-center">
            {error}
          </div>
        )}

        {/* Waveform */}
        {status === 'active' && (
          <div className="flex items-center gap-1 h-10">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="w-1 bg-white/40 rounded-full animate-waveform"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  height: '8px',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Transcript panel */}
      <div className="mx-6 mb-4 bg-navy-dark/50 rounded-xl border border-white/10 max-h-48 overflow-y-auto">
        {transcript.length === 0 ? (
          <div className="p-4 text-white/30 text-center text-sm">
            {status === 'active' ? 'Transcript will appear here...' : ''}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {transcript.map((entry, i) => (
              <div key={i} className="flex gap-3">
                <span
                  className={`text-xs font-semibold mt-0.5 shrink-0 w-12 ${
                    entry.role === 'user' ? 'text-blue-400' : 'text-emerald-400'
                  }`}
                >
                  {entry.role === 'user' ? 'You' : scenario.characterName.split(' ')[0]}
                </span>
                <p className="text-white/80 text-sm leading-relaxed">{entry.text}</p>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6 pb-10 pt-4">
        {status !== 'ended' && (
          <>
            <button
              onClick={toggleMute}
              className={`p-4 rounded-full transition-colors ${
                muted
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {muted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>

            <button
              onClick={handleEndCall}
              className="p-5 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors shadow-lg hover:shadow-xl"
            >
              <PhoneOff size={28} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
