import { useState, useRef, type FormEvent } from 'react';
import { Mail, ArrowRight, KeyRound } from 'lucide-react';
import { useAuth } from './AuthContext';

export default function LoginPage() {
  const { sendCode, verifyCode, error } = useAuth();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    const ok = await sendCode(email.trim().toLowerCase());
    setSubmitting(false);
    if (ok) {
      setStep('code');
      setCode('');
      setTimeout(() => codeRef.current?.focus(), 100);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setSubmitting(true);
    const ok = await verifyCode(email.trim().toLowerCase(), code);
    setSubmitting(false);
    if (!ok) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
    // If ok, onAuthStateChanged in AuthContext handles the rest
  }

  async function handleResend() {
    setSubmitting(true);
    await sendCode(email.trim().toLowerCase());
    setSubmitting(false);
    setCode('');
    codeRef.current?.focus();
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gold rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-navy font-black text-2xl">P</span>
          </div>
          <h1 className="text-white text-2xl font-bold">1-800-Packouts</h1>
          <p className="text-white/50 text-sm mt-1">Internal Tools</p>
        </div>

        {step === 'email' ? (
          /* Step 1: Email */
          <form
            onSubmit={handleSendCode}
            className={`bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-white/10 ${
              shake ? 'animate-shake' : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-6">
              <Mail className="w-5 h-5 text-gold" />
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
                focus:ring-gold/50 transition-all"
            />

            {error && (
              <p className="text-red-300 text-xs mt-3 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-4 bg-gold hover:bg-gold/90 text-navy font-bold py-3 px-4
                rounded-xl flex items-center justify-center gap-2 transition-colors
                disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send sign-in code'}
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        ) : (
          /* Step 2: Code */
          <form
            onSubmit={handleVerifyCode}
            className={`bg-white/10 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-white/10 ${
              shake ? 'animate-shake' : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-4">
              <KeyRound className="w-5 h-5 text-gold" />
              <span className="text-white/80 text-sm font-medium">Enter your code</span>
            </div>
            <p className="text-white/40 text-xs mb-6">
              We sent a 6-digit code to <span className="text-gold">{email}</span>
            </p>

            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoFocus
              className="w-full px-4 py-4 rounded-xl bg-white/10 border border-white/20
                text-white text-center text-2xl font-bold tracking-[0.5em]
                placeholder:text-white/20 placeholder:tracking-[0.5em]
                focus:outline-none focus:ring-2 focus:ring-gold/50 transition-all"
            />

            {error && (
              <p className="text-red-300 text-xs mt-3 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="w-full mt-4 bg-gold hover:bg-gold/90 text-navy font-bold py-3 px-4
                rounded-xl flex items-center justify-center gap-2 transition-colors
                disabled:opacity-50"
            >
              {submitting ? 'Verifying...' : 'Sign in'}
              {!submitting && <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={handleResend}
                disabled={submitting}
                className="text-white/40 text-xs hover:text-white/70 transition-colors disabled:opacity-50"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => { setStep('email'); setCode(''); }}
                className="text-white/40 text-xs hover:text-white/70 transition-colors"
              >
                Different email
              </button>
            </div>
          </form>
        )}

        <p className="text-white/30 text-xs text-center mt-6">
          Need access? Contact Matt Roumain
        </p>
      </div>
    </div>
  );
}
