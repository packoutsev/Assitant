import { useState, type FormEvent } from 'react';
import { Mail, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext';

export default function AuthGate() {
  const { sendLink, error, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber animate-spin" />
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    const ok = await sendLink(email.trim().toLowerCase());
    setSubmitting(false);
    if (ok) {
      setSent(true);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-navy font-extrabold text-2xl">18</span>
          </div>
          <h1 className="text-white text-2xl font-bold">1-800-Packouts</h1>
          <p className="text-white/50 text-sm mt-1">SDR Onboarding Portal</p>
        </div>

        {sent ? (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-white/10 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-white text-lg font-bold mb-2">Check your email</h2>
            <p className="text-white/60 text-sm mb-1">We sent a sign-in link to</p>
            <p className="text-amber font-medium text-sm mb-6">{email}</p>
            <p className="text-white/40 text-xs mb-4">
              Click the link in your email to sign in. The link expires in a few minutes.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="text-white/50 text-xs hover:text-white/80 transition-colors underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className={`bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-white/10 ${
              shake ? 'animate-[shake_0.5s_ease-in-out]' : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-6">
              <Mail className="w-5 h-5 text-amber" />
              <span className="text-white/80 text-sm font-medium">Sign in with email</span>
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@1800packouts.com"
              autoFocus
              required
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20
                text-white placeholder:text-white/30 focus:outline-none focus:ring-2
                focus:ring-amber/50 transition-all"
            />

            {error && (
              <p className="text-red-300 text-xs mt-3 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-4 bg-amber hover:bg-amber-light text-navy font-bold py-3 px-4
                rounded-xl flex items-center justify-center gap-2 transition-colors
                disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send sign-in link'}
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        )}

        <p className="text-white/30 text-xs text-center mt-6">
          Need access? Contact Matt Roumain
        </p>
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
