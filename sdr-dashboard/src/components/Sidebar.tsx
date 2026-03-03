import { CalendarCheck, BarChart3, Target, GraduationCap, BookOpen, BookMarked, Settings, LogOut } from 'lucide-react';
import type { ViewId } from './Layout';

const navItems: { id: ViewId; label: string; icon: typeof CalendarCheck }[] = [
  { id: 'today', label: 'Today', icon: CalendarCheck },
  { id: 'learn', label: 'Learn', icon: BookOpen },
  { id: 'playbook', label: 'Playbook', icon: BookMarked },
  { id: 'training', label: 'Training', icon: GraduationCap },
  { id: 'kpis', label: 'KPIs', icon: Target },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
];

interface SidebarProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  onLogout: () => void;
  isAdmin?: boolean;
}

export default function Sidebar({ activeView, onNavigate, onLogout, isAdmin }: SidebarProps) {
  return (
    <aside className="hidden md:flex flex-col w-64 bg-navy text-white min-h-screen sticky top-0">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber rounded-xl flex items-center justify-center shrink-0">
            <span className="text-navy font-extrabold text-sm">18</span>
          </div>
          <div>
            <h1 className="font-bold text-sm leading-tight">1-800-Packouts</h1>
            <p className="text-white/40 text-xs">SDR Onboarding</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-white/10">
        <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Welcome</p>
        <p className="font-semibold text-amber">{isAdmin ? 'Admin' : 'Vanessa'}</p>
      </div>

      <nav className="flex-1 py-4">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all ${
              activeView === id
                ? 'bg-white/10 text-amber border-r-2 border-amber'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}

        {isAdmin && (
          <>
            <div className="mx-6 my-2 border-t border-white/10" />
            <button
              onClick={() => onNavigate('admin')}
              className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all ${
                activeView === 'admin'
                  ? 'bg-white/10 text-amber border-r-2 border-amber'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Settings className="w-5 h-5" />
              Admin
            </button>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-4 py-2 text-white/40 hover:text-white/70 text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
