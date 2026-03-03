import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ClipboardCheck, Home, Wrench, History, Phone } from 'lucide-react';
import { scenarioTypes, type ScenarioType, type Difficulty } from '../scenarios';

const icons: Record<string, typeof ClipboardCheck> = {
  ClipboardCheck,
  Home,
  Wrench,
};

const difficultyLabels: { value: Difficulty; label: string; color: string }[] = [
  { value: 'friendly', label: 'Friendly', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'neutral', label: 'Neutral', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'tough', label: 'Tough', color: 'bg-red-100 text-red-700 border-red-300' },
];

const cardColors: Record<string, { bg: string; border: string; icon: string }> = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-600' },
};

export default function ScenarioSelect() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<{ type: ScenarioType; difficulty: Difficulty } | null>(null);

  function handleStart() {
    if (!selected) return;
    navigate(`/call/${selected.type}/${selected.difficulty}`);
  }

  return (
    <div className="min-h-screen bg-warm">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-navy">Call Trainer</h1>
            <p className="text-navy/60 mt-1">Practice your sales calls against AI prospects</p>
          </div>
          <Link
            to="/history"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-warm-dark text-navy/70 hover:text-navy hover:border-navy/30 transition-colors"
          >
            <History size={18} />
            <span className="text-sm font-medium">History</span>
          </Link>
        </div>

        {/* Scenario Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {scenarioTypes.map((scenario) => {
            const Icon = icons[scenario.icon];
            const colors = cardColors[scenario.color];
            const isTypeSelected = selected?.type === scenario.type;

            return (
              <div
                key={scenario.type}
                className={`rounded-xl border-2 p-6 transition-all ${
                  isTypeSelected
                    ? `${colors.bg} ${colors.border} shadow-lg scale-[1.02]`
                    : 'bg-white border-warm-dark hover:border-navy/20 hover:shadow-md'
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg ${colors.bg}`}>
                    <Icon size={24} className={colors.icon} />
                  </div>
                  <h2 className="text-lg font-semibold text-navy">{scenario.label}</h2>
                </div>

                {/* Difficulty buttons */}
                <div className="flex flex-col gap-2">
                  {difficultyLabels.map((diff) => {
                    const isActive = selected?.type === scenario.type && selected?.difficulty === diff.value;
                    return (
                      <button
                        key={diff.value}
                        onClick={() => setSelected({ type: scenario.type, difficulty: diff.value })}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left ${
                          isActive
                            ? `${diff.color} border-current shadow-sm`
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                      >
                        {diff.label}
                        {diff.value === 'friendly' && ' — Easy warmup'}
                        {diff.value === 'neutral' && ' — Realistic challenge'}
                        {diff.value === 'tough' && ' — Hard mode'}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Start Button */}
        <div className="flex justify-center">
          <button
            onClick={handleStart}
            disabled={!selected}
            className={`flex items-center gap-3 px-8 py-4 rounded-xl text-lg font-semibold transition-all ${
              selected
                ? 'bg-navy text-white hover:bg-navy-light shadow-lg hover:shadow-xl cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Phone size={22} />
            Start Call
          </button>
        </div>
      </div>
    </div>
  );
}
