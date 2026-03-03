import { type ReactNode } from 'react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

export type ViewId = 'today' | 'learn' | 'playbook' | 'progress' | 'kpis' | 'training' | 'admin';

interface LayoutProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  children: ReactNode;
  onLogout: () => void;
  isAdmin?: boolean;
}

export default function Layout({ activeView, onNavigate, children, onLogout, isAdmin }: LayoutProps) {
  return (
    <div className="min-h-screen flex bg-warm">
      <Sidebar activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} isAdmin={isAdmin} />
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto min-h-screen">
        <div className="max-w-5xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>
      <BottomNav activeView={activeView} onNavigate={onNavigate} />
    </div>
  );
}
