import { Clock } from 'lucide-react';
import { DEADLINE } from '../data/schedule';

export function CountdownBanner() {
  const now = new Date();
  const deadline = new Date(DEADLINE);
  const diffMs = deadline.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let bgColor = 'bg-sage-light border-sage/30';
  let textColor = 'text-sage';
  if (daysLeft <= 7) {
    bgColor = 'bg-red-50 border-red-200';
    textColor = 'text-red-700';
  } else if (daysLeft <= 21) {
    bgColor = 'bg-amber-50 border-amber-200';
    textColor = 'text-amber-700';
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${bgColor}`}>
      <Clock size={20} className={textColor} />
      <div>
        <span className={`text-2xl font-bold ${textColor}`}>{daysLeft}</span>
        <span className={`text-sm ml-1.5 ${textColor}`}>days until April 21</span>
      </div>
    </div>
  );
}
