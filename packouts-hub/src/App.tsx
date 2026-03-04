import { GraduationCap, Warehouse, ListChecks, Flame, Briefcase, Globe, ExternalLink, ChevronRight, BookOpen, BookMarked, DollarSign, LogOut, Users, Phone, Home, ClipboardCheck, CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from './auth/AuthContext';

interface AppItem {
  id: string;
  title: string;
  desc: string;
  url: string;
  icon: LucideIcon;
  color: string;
  internal?: boolean;
}

// All Hub tiles with stable IDs for permission matching
const ALL_SECTIONS: { label: string; apps: AppItem[]; ownerOnly?: boolean }[] = [
  {
    label: 'Operations',
    apps: [
      { id: 'jobs', title: 'Jobs', desc: 'Xcelerate + Encircle + QBO', url: '/jobs', icon: Briefcase, color: 'bg-sky-500', internal: true },
      { id: 'tick-sheet', title: 'Cleaning Scope', desc: 'Structure cleaning tick sheet', url: '/tick-sheet', icon: ClipboardCheck, color: 'bg-teal-600', internal: true },
      { id: 'ar', title: 'A/R', desc: 'Aging & collections', url: '/ar', icon: DollarSign, color: 'bg-emerald-600', internal: true },
      { id: 'wiki', title: 'Wiki', desc: 'Technical docs & architecture', url: '/wiki', icon: BookOpen, color: 'bg-gray-700', internal: true },
      { id: 'journal', title: 'Build Journal', desc: 'Daily build log', url: '/journal', icon: BookMarked, color: 'bg-amber-600', internal: true },
      { id: 'calendar', title: 'Calendar', desc: 'Schedule & appointments', url: '/calendar', icon: CalendarDays, color: 'bg-sky-600', internal: true },
      { id: 'team', title: 'Team', desc: 'Manage users & roles', url: '/users', icon: Users, color: 'bg-indigo-500', internal: true },
    ],
  },
  {
    label: 'Sales',
    apps: [
      { id: 'fire-leads', title: 'Fire Leads', desc: 'Lead feed & SDR tracking', url: '/fire-leads', icon: Flame, color: 'bg-red-600', internal: true },
      { id: 'call-trainer', title: 'Call Trainer', desc: 'AI sales call practice', url: '/call-trainer', icon: Phone, color: 'bg-rose-500', internal: true },
      { id: 'sdr-onboarding', title: 'SDR Onboarding', desc: 'Training & KPIs', url: 'https://sdr-onboard.web.app', icon: GraduationCap, color: 'bg-emerald-500' },
    ],
  },
  {
    label: 'Apps',
    apps: [
      { id: 'vault-manager', title: 'Vault Manager', desc: '3D warehouse & QR', url: 'https://packouts-vault.web.app', icon: Warehouse, color: 'bg-navy' },
      { id: 'gtd-capture', title: 'GTD Capture', desc: 'Task inbox', url: 'https://gtd-capture.web.app', icon: ListChecks, color: 'bg-violet-500' },
    ],
  },
  {
    label: 'Marketing',
    apps: [
      { id: 'websites', title: 'Websites', desc: 'Analytics & Search Console', url: '/websites', icon: Globe, color: 'bg-teal-500', internal: true },
    ],
  },
  {
    label: 'Personal Projects',
    ownerOnly: true,
    apps: [
      { id: 'remodel', title: 'Remodel Tracker', desc: 'Primary suite project', url: 'https://remodel-1800.web.app', icon: Home, color: 'bg-amber-700' },
    ],
  },
];

// Export tile IDs for UserManagement form
export const HUB_TILE_OPTIONS = ALL_SECTIONS.flatMap(s =>
  s.apps.filter(a => a.id !== 'team').map(a => ({ id: a.id, label: a.title, section: s.label }))
);

function getFilteredSections(isOwnerUser: boolean, isAdminUser: boolean, hubTiles?: string[]): { label: string; apps: AppItem[] }[] {
  return ALL_SECTIONS
    .filter((section) => {
      // Owner-only sections: only visible to the owner
      if (section.ownerOnly) return isOwnerUser;
      return true;
    })
    .map((section) => {
      const apps = section.apps.filter((app) => {
        // Team tile: admin-only, always visible to admins
        if (app.id === 'team') return isAdminUser;
        // Owner/admin sees everything
        if (isAdminUser) return true;
        // If hub_tiles is set, only show listed tiles; otherwise show all
        if (hubTiles && hubTiles.length > 0) return hubTiles.includes(app.id);
        return true;
      });
      return { label: section.label, apps };
    })
    .filter((section) => section.apps.length > 0);
}

function Tile({ app }: { app: AppItem }) {
  const Icon = app.icon;
  const inner = (
    <>
      <div className={`w-9 h-9 rounded-lg ${app.color} flex items-center justify-center mb-2`}>
        <Icon className="w-4.5 h-4.5 text-white" />
      </div>
      <h3 className="text-sm font-bold text-gray-800 group-hover:text-navy transition-colors leading-tight">
        {app.title}
      </h3>
      <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{app.desc}</p>
      <div className="absolute top-2.5 right-2.5">
        {app.internal
          ? <ChevronRight className="w-3.5 h-3.5 text-gray-200 group-hover:text-navy/40 transition-colors" />
          : <ExternalLink className="w-3.5 h-3.5 text-gray-200 group-hover:text-navy/40 transition-colors" />
        }
      </div>
    </>
  );

  const cls = "group relative bg-white rounded-xl border border-gray-200 p-3.5 hover:border-navy/30 hover:shadow-md transition-all block";

  return app.internal ? (
    <Link to={app.url} className={cls}>{inner}</Link>
  ) : (
    <a href={app.url} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
  );
}

export default function App() {
  const { profile, logout, isOwner, isAdmin } = useAuth();
  const sections = getFilteredSections(isOwner, isOwner || isAdmin, profile?.hub_tiles);

  return (
    <div className="min-h-screen bg-warm">
      <header className="bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gold flex items-center justify-center">
                <span className="text-navy font-black text-base">P</span>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">1-800-Packouts</h1>
                <p className="text-xs text-white/50">Internal Tools Hub</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50 hidden sm:inline">{profile?.name}</span>
              <button
                onClick={logout}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {sections.map((section) => (
          <div key={section.label}>
            <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">
              {section.label}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {section.apps.map((app) => (
                <Tile key={app.title} app={app} />
              ))}
            </div>
          </div>
        ))}

      </main>

      <footer className="max-w-5xl mx-auto px-6 pb-6">
        <p className="text-[10px] text-gray-300 text-center">
          1-800-Packouts of the East Valley &middot; Internal use only
        </p>
      </footer>
    </div>
  );
}
