import { LayoutDashboard, ClipboardList, Calendar, ShoppingCart, DollarSign, PenLine, Users, Camera, FileText } from 'lucide-react';
import type { ViewId } from '../types';

interface SidebarProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
}

const navItems: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'scope', label: 'Scope of Work', icon: ClipboardList },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'orders', label: 'Orders & Decisions', icon: ShoppingCart },
  { id: 'budget', label: 'Budget', icon: DollarSign },
  { id: 'log', label: 'Daily Log', icon: PenLine },
  { id: 'subs', label: 'Subs & Vendors', icon: Users },
  { id: 'photos', label: 'Photos & Measure', icon: Camera },
  { id: 'brief', label: 'Project Brief', icon: FileText },
];

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <aside className="hidden md:flex flex-col w-56 bg-slate-dark text-white fixed h-full z-10">
      <div className="p-4 border-b border-white/10">
        <h1 className="text-lg font-bold text-copper">Remodel Tracker</h1>
        <p className="text-xs text-white/50 mt-0.5">Primary Suite</p>
      </div>
      <nav className="flex-1 py-2">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
              activeView === id
                ? 'bg-copper/20 text-copper border-r-2 border-copper'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
