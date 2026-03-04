import { useState, useRef, useEffect } from 'react';
import { Flame, ShieldCheck } from 'lucide-react';

interface Props {
  onSubmit: (pin: string) => Promise<boolean>;
}

export default function TeamPinGate({ onSubmit }: Props) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    refs[0].current?.focus();
  }, []);

  const handleChange = async (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    setError(false);

    if (value && index < 3) {
      refs[index + 1].current?.focus();
    }

    // Auto-submit when all 4 digits entered
    if (value && index === 3 && next.every((d) => d)) {
      setChecking(true);
      const ok = await onSubmit(next.join(''));
      if (!ok) {
        setError(true);
        setDigits(['', '', '', '']);
        setTimeout(() => refs[0].current?.focus(), 200);
      }
      setChecking(false);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (text.length === 4) {
      const next = text.split('');
      setDigits(next);
      setError(false);
      setChecking(true);
      const ok = await onSubmit(next.join(''));
      if (!ok) {
        setError(true);
        setDigits(['', '', '', '']);
        setTimeout(() => refs[0].current?.focus(), 200);
      }
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy via-navy to-blue-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center">
            <Flame className="w-7 h-7 text-orange-500" />
          </div>
        </div>

        <h1 className="text-xl font-bold text-navy mb-1">Fire Leads</h1>
        <p className="text-sm text-gray-500 mb-6">Enter your team PIN to continue</p>

        <div className="flex justify-center gap-3 mb-6" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={checking}
              className={`w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 outline-none transition-all ${
                error
                  ? 'border-red-400 bg-red-50 animate-shake'
                  : 'border-gray-200 focus:border-gold focus:ring-2 focus:ring-gold/20 bg-gray-50'
              }`}
            />
          ))}
        </div>

        {error && <p className="text-sm text-red-500 mb-4">Invalid PIN. Try again.</p>}

        {checking && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
            <ShieldCheck className="w-4 h-4 animate-pulse" />
            Verifying...
          </div>
        )}

        <p className="text-xs text-gray-400 mt-6">Contact your admin if you don't have a PIN</p>
      </div>
    </div>
  );
}
