import { useState, useMemo } from 'react';
import { Search, Building2, Clock, AlertTriangle, ShieldX, FileText, ClipboardList, Swords, Users } from 'lucide-react';
import type { QuickRefEntry } from '../types';

interface ReferenceViewProps {
  entries: QuickRefEntry[];
}

const sectionIcons: Record<string, typeof Building2> = {
  'COMPANY INFO': Building2,
  'Company Info': Building2,
  'KEY SLAs': Clock,
  'Key SLAs': Clock,
  'ESCALATION TRIGGERS (go to Matt immediately)': AlertTriangle,
  'Escalation Triggers': AlertTriangle,
  'NEVER DO (from playbook)': ShieldX,
  'Never Do': ShieldX,
  'HUBSPOT NOTE TEMPLATE': FileText,
  'HubSpot Note Template': FileText,
  'DAILY SUMMARY TEMPLATE': ClipboardList,
  'Daily Summary Template': ClipboardList,
  'KEY COMPETITORS': Swords,
  'Key Competitors': Swords,
  'CORPORATE PACKOUTS CONTACTS': Users,
  'Contacts': Users,
};

const sectionStyles: Record<string, string> = {
  'Company Info': 'border-navy/20 bg-navy/5',
  'COMPANY INFO': 'border-navy/20 bg-navy/5',
  'Key SLAs': 'border-amber/30 bg-amber/5',
  'KEY SLAs': 'border-amber/30 bg-amber/5',
  'Escalation Triggers': 'border-orange-200 bg-orange-50',
  'ESCALATION TRIGGERS (go to Matt immediately)': 'border-orange-200 bg-orange-50',
  'Never Do': 'border-red-200 bg-red-50',
  'NEVER DO (from playbook)': 'border-red-200 bg-red-50',
  'Key Competitors': 'border-gray-200 bg-gray-50',
  'KEY COMPETITORS': 'border-gray-200 bg-gray-50',
  'Contacts': 'border-purple-200 bg-purple-50',
  'CORPORATE PACKOUTS CONTACTS': 'border-purple-200 bg-purple-50',
};

export default function ReferenceView({ entries }: ReferenceViewProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(e =>
      e.key.toLowerCase().includes(q) ||
      e.value.toLowerCase().includes(q) ||
      e._section.toLowerCase().includes(q)
    );
  }, [entries, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, QuickRefEntry[]> = {};
    for (const entry of filtered) {
      if (!groups[entry._section]) groups[entry._section] = [];
      groups[entry._section].push(entry);
    }
    return Object.entries(groups);
  }, [filtered]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Quick Reference</h1>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search reference..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber/50 focus:border-amber"
        />
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {grouped.map(([section, items]) => {
          const Icon = sectionIcons[section] || Building2;
          const style = sectionStyles[section] || 'border-gray-200 bg-white';

          return (
            <div key={section} className={`rounded-2xl border overflow-hidden ${style}`}>
              <div className="px-5 py-3 flex items-center gap-2 border-b border-gray-200/50">
                <Icon className="w-4 h-4 text-gray-500" />
                <h2 className="font-bold text-sm text-gray-700">{section}</h2>
              </div>
              <div className="bg-white/80 divide-y divide-gray-100">
                {items.map((item, i) => (
                  <div key={i} className="px-5 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                    <span className="text-sm font-semibold text-gray-700 sm:w-48 shrink-0">{item.key}</span>
                    <span className="text-sm text-gray-600">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {grouped.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No results for "{search}"</p>
          </div>
        )}
      </div>

      {/* HubSpot Note Template (special section) */}
      <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-gray-500" />
          <h2 className="font-bold text-sm text-gray-700">HubSpot Note Template</h2>
        </div>
        <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono">
{`**Call Type**: [Fire Lead / Cold - GC / Cold - Adjuster / Cold - PM / Follow-Up]
**Outcome**: [Live Conversation / Voicemail / No Answer / Wrong Number / Gatekeeper]
**Contact**: [Name, Title if known]
**Company**: [Company name if applicable]

**Intel Gathered**:
- Current packout vendor: [name or "none"]
- Volume: [X jobs/month or "unknown"]
- Contract status: [locked in / job-by-job / unknown]
- Decision maker: [name + title]
- Interest level: [cold / lukewarm / warm / hot]

**Next Steps**:
- [Specific action + date]`}
        </pre>
      </div>

      {/* Daily Summary Template */}
      <div className="mt-4 bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="w-4 h-4 text-gray-500" />
          <h2 className="font-bold text-sm text-gray-700">Daily Summary Template</h2>
        </div>
        <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono">
{`**SDR Daily Report — [DATE]**

Dials: [X]
Live conversations: [X]
Voicemails: [X]
Fire leads worked: [X]

**Hot leads (escalate to Matt)**:
- [Contact] @ [Company] — [1 sentence why]

**Key intel**:
- [Company] uses [Competitor] for packouts, [volume], [contract status]

**Follow-ups scheduled**:
- [Contact] — [date] — [reason]`}
        </pre>
      </div>
    </div>
  );
}
