import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ClipboardCheck, Home, Wrench, History, Phone, ArrowLeft, BarChart3 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { scenarioTypes, type ScenarioType, type Difficulty } from '../scenarios';

const icons: Record<string, typeof ClipboardCheck> = {
  ClipboardCheck,
  Home,
  Wrench,
};

const difficultyLabels: { value: Difficulty; label: string; desc: string; color: string }[] = [
  { value: 'friendly', label: 'Friendly', desc: 'Easy warmup', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'neutral', label: 'Neutral', desc: 'Realistic challenge', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'tough', label: 'Tough', desc: 'Hard mode', color: 'bg-red-100 text-red-700 border-red-300' },
];

const cardColors: Record<string, { bg: string; border: string; icon: string }> = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-600' },
};

export default function ScenarioSelect() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [selected, setSelected] = useState<{ type: ScenarioType; difficulty: Difficulty } | null>(null);

  function handleStart() {
    if (!selected) return;
    navigate(`/call-trainer/call/${selected.type}/${selected.difficulty}`);
  }

  return (
    <div className="min-h-screen bg-warm">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Link to="/" className="p-2 rounded-lg hover:bg-white/60 transition-colors">
              <ArrowLeft size={20} className="text-gray-400" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-navy">Call Trainer</h1>
              <p className="text-gray-400 text-sm">Practice sales calls against AI prospects</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                to="/call-trainer/stats"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-navy hover:border-navy/30 transition-colors"
              >
                <BarChart3 size={16} />
                <span className="text-sm font-medium">Stats</span>
              </Link>
            )}
            <Link
              to="/call-trainer/history"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-navy hover:border-navy/30 transition-colors"
            >
              <History size={16} />
              <span className="text-sm font-medium">History</span>
            </Link>
          </div>
        </div>

        {/* Scenario Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {scenarioTypes.map((scenario) => {
            const Icon = icons[scenario.icon];
            const colors = cardColors[scenario.color];
            const isTypeSelected = selected?.type === scenario.type;

            return (
              <div
                key={scenario.type}
                className={`rounded-xl border-2 p-5 transition-all ${
                  isTypeSelected
                    ? `${colors.bg} ${colors.border} shadow-lg scale-[1.02]`
                    : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg ${colors.bg}`}>
                    <Icon size={22} className={colors.icon} />
                  </div>
                  <h2 className="text-base font-bold text-gray-800">{scenario.label}</h2>
                </div>

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
                            : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                        }`}
                      >
                        {diff.label}
                        <span className="text-xs ml-1 opacity-70">— {diff.desc}</span>
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
