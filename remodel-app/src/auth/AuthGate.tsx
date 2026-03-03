import { useState, type FormEvent } from 'react';
import { Lock, ArrowRight } from 'lucide-react';

interface AuthGateProps {
  onLogin: (pin: string) => boolean;
}

export default function AuthGate({ onLogin }: AuthGateProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (onLogin(pin)) return;
    setError(true);
    setShake(true);
    setTimeout(() => setShake(false), 500);
    setPin('');
  }

  return (
    <div className="min-h-screen bg-slate-dark flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-copper rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-extrabold text-xl">R</span>
          </div>
          <h1 className="text-white text-2xl font-bold">Remodel Tracker</h1>
          <p className="text-white/50 text-sm mt-1">Primary Suite</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className={`bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-white/10 ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
        >
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-copper" />
            <span className="text-white/80 text-sm font-medium">Enter access code</span>
          </div>

          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => { setPin(e.target.value); setError(false); }}
            placeholder="PIN"
            autoFocus
            className={`w-full px-4 py-3 rounded-xl bg-white/10 border text-white text-center text-2xl tracking-[0.5em] font-mono placeholder:text-white/30 placeholder:text-base placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-copper/50 transition-all ${
              error ? 'border-red-400 bg-red-500/10' : 'border-white/20'
            }`}
          />

          {error && (
            <p className="text-red-300 text-xs mt-2 text-center">Incorrect code. Try again.</p>
          )}

          <button
            type="submit"
            className="w-full mt-4 bg-copper hover:bg-copper-light text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
