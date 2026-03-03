import { ArrowLeft, ExternalLink, FileDown, Globe, Phone, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';

const resources = [
  {
    title: 'AZ Fire Help Website',
    description: 'Public resource site — fire recovery guide, insurance claim walkthrough, checklists, and free tools for Arizona homeowners.',
    url: 'https://azfirehelp.com',
    icon: Globe,
    action: 'Visit Site',
    external: true,
  },
  {
    title: 'Door-Drop Trifold Brochure',
    description: 'Double-sided trifold (11x8.5 landscape) — covers our services, 6 recovery steps, insurance tips, and contact info. Print-ready PDF.',
    url: '/AZ-Fire-Help-Brochure.pdf',
    icon: FileDown,
    action: 'Download PDF',
    external: false,
  },
];

export default function AZFireHelp() {
  return (
    <div className="min-h-screen bg-warm">
      {/* Header */}
      <header className="bg-navy text-white">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Hub
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">AZ Fire Help</h1>
              <p className="text-sm text-white/60">Marketing materials & resources</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Quick info bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2 text-sm">
            <Globe className="w-4 h-4 text-gray-400" />
            <a href="https://azfirehelp.com" target="_blank" rel="noopener noreferrer" className="text-navy font-semibold hover:underline">
              azfirehelp.com
            </a>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-gray-400" />
            <span className="text-gray-700 font-mono">623-400-8711</span>
          </div>
          <div className="text-xs text-gray-400">
            Mesa, AZ &middot; Available 24/7 &middot; Insurance-covered services
          </div>
        </div>

        {/* Resource cards */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Resources</h2>
          {resources.map((item) => {
            const Icon = item.icon;
            const Tag = item.external ? 'a' : 'a';
            return (
              <Tag
                key={item.title}
                href={item.url}
                target={item.external ? '_blank' : '_self'}
                rel={item.external ? 'noopener noreferrer' : undefined}
                download={!item.external ? true : undefined}
                className="group flex items-start gap-5 bg-white rounded-xl border border-gray-200 p-5 hover:border-navy/30 hover:shadow-md transition-all"
              >
                <div className="w-11 h-11 rounded-lg bg-navy/5 flex items-center justify-center flex-shrink-0 group-hover:bg-navy/10 transition-colors">
                  <Icon className="w-5 h-5 text-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-800 group-hover:text-navy transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-navy opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1">
                  {item.action}
                  {item.external && <ExternalLink className="w-3.5 h-3.5" />}
                </div>
              </Tag>
            );
          })}
        </div>

        {/* Brochure usage notes */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-orange-800 mb-2">Brochure Print Instructions</h3>
          <ul className="text-sm text-orange-700 space-y-1.5 leading-relaxed">
            <li>&bull; Print double-sided on letter paper (8.5&times;11)</li>
            <li>&bull; PDF is already landscape-formatted &mdash; no printer settings to change</li>
            <li>&bull; Fold into thirds: right panel in first, then left panel over it</li>
            <li>&bull; Front cover faces out, inside flap is first thing seen when opened</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
