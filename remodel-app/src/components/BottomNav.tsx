import { LayoutDashboard, ClipboardList, Calendar, ShoppingCart, DollarSign, PenLine, Users, Camera, FileText } from 'lucide-react';
import type { ViewId } from '../types';

interface BottomNavProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
}

const navItems: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'scope', label: 'Scope', icon: ClipboardList },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'budget', label: 'Budget', icon: DollarSign },
  { id: 'log', label: 'Log', icon: PenLine },
  { id: 'subs', label: 'Subs', icon: Users },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'brief', label: 'Brief', icon: FileText },
];

export function BottomNav({ activeView, onNavigate }: BottomNavProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-warm-dark flex justify-around py-1.5 z-20">
      {navItems.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          className={`flex flex-col items-center gap-0.5 px-1 py-1 text-[10px] transition-colors ${
            activeView === id ? 'text-copper' : 'text-slate-light'
          }`}
        >
          <Icon size={18} />
          {label}
        </button>
      ))}
    </nav>
  );
}
