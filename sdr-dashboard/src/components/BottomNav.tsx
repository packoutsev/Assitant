import { CalendarCheck, Target, GraduationCap, BookOpen, BookMarked } from 'lucide-react';
import type { ViewId } from './Layout';

const navItems: { id: ViewId; label: string; icon: typeof CalendarCheck }[] = [
  { id: 'today', label: 'Today', icon: CalendarCheck },
  { id: 'learn', label: 'Learn', icon: BookOpen },
  { id: 'playbook', label: 'Playbook', icon: BookMarked },
  { id: 'training', label: 'Training', icon: GraduationCap },
  { id: 'kpis', label: 'KPIs', icon: Target },
];

interface BottomNavProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
}

export default function BottomNav({ activeView, onNavigate }: BottomNavProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-navy border-t border-white/10 z-50">
      <div className="flex">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors ${
              activeView === id ? 'text-amber' : 'text-white/40'
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
