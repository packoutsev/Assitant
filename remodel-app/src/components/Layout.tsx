import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import type { ViewId } from '../types';

interface LayoutProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  children: ReactNode;
}

export function Layout({ activeView, onNavigate, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-warm flex">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <main className="flex-1 pb-20 md:pb-0 md:ml-56">
        <div className="max-w-4xl mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>
      <BottomNav activeView={activeView} onNavigate={onNavigate} />
    </div>
  );
}
