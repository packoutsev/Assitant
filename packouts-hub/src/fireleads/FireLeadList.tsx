import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Flame, MapPin, Phone, User, Building2, ChevronDown, ChevronUp,
  Loader2, Clock, Search, ArrowUpDown, GraduationCap, ExternalLink,
  Home, DollarSign, Lightbulb, MessageSquare, Send, BarChart3, TrendingUp,
  Users as UsersIcon, Globe, FileDown, LogOut, Shield, Navigation,
} from 'lucide-react';
import { getMcpClient } from '../jobs/McpClient';
import type { FireLead, FireLeadStatus, CallNote } from '../jobs/types';
import { useTeamAuth, type TeamConfig } from './useTeamAuth';
import TeamPinGate from './TeamPinGate';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const STATUS_OPTIONS: { value: FireLeadStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-700' },
  { value: 'contacted', label: 'Contacted', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'pursuing', label: 'Pursuing', color: 'bg-purple-100 text-purple-700' },
  { value: 'converted', label: 'Converted', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'no_answer', label: 'No Answer', color: 'bg-gray-100 text-gray-600' },
  { value: 'not_interested', label: 'Not Interested', color: 'bg-red-100 text-red-600' },
];

// Team config is loaded dynamically from Firestore via useTeamAuth

type FilterValue = 'all' | FireLeadStatus;
type SortKey = 'newest' | 'oldest' | 'city_az' | 'city_za';
type ViewTab = 'leads' | 'metrics' | 'training' | 'azfirehelp';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'city_az', label: 'City A → Z' },
  { value: 'city_za', label: 'City Z → A' },
];

function statusColor(status: FireLeadStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.color || 'bg-gray-100 text-gray-600';
}

function formatDate(date?: string): string {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return date;
  }
}

function getStreetName(address?: string): string {
  if (!address) return '';
  // Extract just the street name (e.g. "3640 West Bloomfield Road" → "Bloomfield Road")
  const parts = address.split(',')[0].trim().split(' ');
  if (parts.length >= 3) return parts.slice(1).join(' ');
  return parts.join(' ');
}

function getPropertyType(lead: FireLead): string {
  const details = (lead.property_details || '').toLowerCase();
  const notes = (lead.notes || '').toLowerCase();
  const occupancy = (lead.occupancy || '').toLowerCase();
  if (notes.includes('apartment') || details.includes('apartment') || occupancy.includes('apartment'))
    return 'Apartment/Multi-family';
  if (notes.includes('commercial') || details.includes('commercial') || lead.commercial_name)
    return 'Commercial';
  if (notes.includes('single family') || details.includes('single family') || details.includes('sfr'))
    return 'Single Family Residence';
  if (notes.includes('mobile') || details.includes('mobile') || details.includes('manufactured'))
    return 'Mobile/Manufactured Home';
  if (notes.includes('townho') || details.includes('townho') || details.includes('condo'))
    return 'Townhome/Condo';
  return 'Residential';
}

function generateBrief(lead: FireLead): string {
  const lines: string[] = [];
  const propType = getPropertyType(lead);
  const isFire = /fire/i.test(lead.incident_type || '');
  const isWater = /water|flood/i.test(lead.incident_type || '');
  const isConfirmed = !/unconfirmed/i.test(lead.incident_type || '');

  // Property assessment
  lines.push(`${propType} in ${lead.city || 'unknown area'}.`);

  if (lead.property_value) {
    lines.push(`Assessed at ${lead.property_value}.`);
  }

  // Incident assessment
  if (isFire && isConfirmed) {
    lines.push('Confirmed structure fire — high probability of packout need.');
  } else if (isFire && !isConfirmed) {
    lines.push('Unconfirmed fire — verify with homeowner before committing resources.');
  } else if (isWater) {
    lines.push('Water event — potential contents damage depending on severity and floor level.');
  }

  // Occupancy insight
  if (lead.renter_name) {
    lines.push('Renter-occupied — decision may involve both tenant and owner. Contact renter first (on-site).');
  } else if (/owner.occupied/i.test(lead.occupancy || '')) {
    lines.push('Owner-occupied — single decision-maker, fastest path to engagement.');
  }

  // Contact quality
  const hasPhone = lead.owner_phone || lead.renter_phone || lead.commercial_phone;
  if (hasPhone) {
    lines.push('Phone number available — call is the priority.');
  } else {
    lines.push('No phone on file — door knock or skip-trace needed.');
  }

  // Services insight
  if (lead.services && lead.services.length > 0) {
    const hasContents = lead.services.some((s) => /contents|cleaning/i.test(s));
    const hasBoardUp = lead.services.some((s) => /board up/i.test(s));
    if (hasContents) {
      lines.push('Contents cleaning flagged — strong packout candidate.');
    }
    if (hasBoardUp) {
      lines.push('Board-up needed — property is likely unsecured, urgent response.');
    }
  }

  return lines.join(' ');
}

function PropertyImage({ address }: { address?: string }) {
  const [imgError, setImgError] = useState(false);
  const zillowUrl = address ? `https://www.zillow.com/homes/${encodeURIComponent(address)}_rb/` : null;

  if (!address || imgError) {
    return (
      <div>
        <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
          <MapPin className="w-5 h-5" />
        </div>
        {zillowUrl && (
          <a href={zillowUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-400 hover:text-navy mt-1 inline-block">
            Zillow
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      <img
        src={`https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=19&size=400x150&maptype=hybrid&key=${MAPS_API_KEY}`}
        alt={`Aerial view of ${address}`}
        className="w-full h-32 object-cover rounded-lg"
        onError={() => setImgError(true)}
      />
      <a href={zillowUrl!} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-400 hover:text-navy mt-1 inline-block">
        Zillow
      </a>
    </div>
  );
}

function PhoneLink({ number, label }: { number?: string; label: string }) {
  if (!number) return null;
  const digits = number.replace(/\D/g, '').slice(0, 10);
  return (
    <a
      href={`tel:+1${digits}`}
      className="inline-flex items-center gap-1 text-sm text-navy hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <Phone className="w-3 h-3" />
      {label}: {number}
    </a>
  );
}

function NoteSection({ lead, onNoteAdded, members }: { lead: FireLead; onNoteAdded: (note: CallNote) => void; members: string[] }) {
  const [text, setText] = useState('');
  const [author, setAuthor] = useState(members[0] || 'Unknown');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await getMcpClient('xcelerate').callTool('update_firelead_status', {
        lead_id: lead.id,
        add_note: { text: text.trim(), author },
      });
      onNoteAdded({ text: text.trim(), author, created_at: new Date().toISOString() });
      setText('');
    } catch (e) {
      console.error('Failed to add note:', e);
    }
    setSaving(false);
  };

  const notes = lead.call_notes || [];

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        <MessageSquare className="w-3 h-3" />
        Notes ({notes.length})
      </h4>

      {notes.length > 0 && (
        <div className="space-y-2 mb-3">
          {notes.map((n, i) => (
            <div key={i} className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-sm text-gray-700">{n.text}</p>
              <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                {n.author && <span>{n.author}</span>}
                {n.created_at && <span>{new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <select
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 bg-white text-gray-700"
        >
          {members.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <div className="flex-1 flex flex-col gap-1.5">
          <textarea
            placeholder="Add a note..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            rows={3}
            className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 resize-y focus:outline-none focus:border-navy/40 focus:ring-1 focus:ring-navy/20"
          />
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={saving || !text.trim()}
              className="px-3 py-1.5 rounded-lg bg-navy text-white text-xs font-medium disabled:opacity-40 hover:bg-navy-light transition-colors flex items-center gap-1"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3" /> Add Note</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadCard({ lead, onUpdate, isAdmin, teams, members }: { lead: FireLead; onUpdate: (id: string, patch: Partial<FireLead>) => void; isAdmin: boolean; teams: TeamConfig[]; members: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleStatusChange = async (newStatus: FireLeadStatus) => {
    setSaving(true);
    try {
      await getMcpClient('xcelerate').callTool('update_firelead_status', {
        lead_id: lead.id,
        status: newStatus,
      });
      onUpdate(lead.id, { status: newStatus });
    } catch (e) {
      console.error('Status update failed:', e);
    }
    setSaving(false);
  };

  const handleTeamAssign = async (teamId: string) => {
    setSaving(true);
    try {
      await getMcpClient('xcelerate').callTool('update_firelead_status', {
        lead_id: lead.id,
        assigned_team: teamId || undefined,
      });
      onUpdate(lead.id, { assigned_team: teamId || undefined });
    } catch (e) {
      console.error('Team assignment failed:', e);
    }
    setSaving(false);
  };

  const handleMemberAssign = async (assignee: string) => {
    setSaving(true);
    try {
      await getMcpClient('xcelerate').callTool('update_firelead_status', {
        lead_id: lead.id,
        assigned_to: assignee || undefined,
      });
      onUpdate(lead.id, { assigned_to: assignee || undefined });
    } catch (e) {
      console.error('Assignment update failed:', e);
    }
    setSaving(false);
  };

  const hasContact = lead.owner_name || lead.renter_name || lead.commercial_name;
  const hasPhone = lead.owner_phone || lead.renter_phone || lead.commercial_phone;
  const brief = useMemo(() => generateBrief(lead), [lead]);
  const streetName = getStreetName(lead.address);
  const isFire = /fire/i.test(lead.incident_type || '');

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-navy/10 transition-all">
      {/* Top row: type badge + date/time + status dropdown */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold uppercase">
            <Flame className="w-3 h-3" />
            {lead.incident_type || 'Fire'}
          </span>
          {lead.date && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {formatDate(lead.date)}{lead.time ? ` at ${lead.time}` : ''}
            </span>
          )}
        </div>
        <select
          value={lead.status}
          onChange={(e) => handleStatusChange(e.target.value as FireLeadStatus)}
          disabled={saving}
          className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer flex-shrink-0 ${statusColor(lead.status)} ${saving ? 'opacity-50' : ''}`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Property image + address side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4 mb-3">
        <PropertyImage address={lead.address} />
        <div className="space-y-2">
          {/* Address */}
          {lead.address && (
            <div className="flex items-start gap-1.5 text-sm text-gray-800 font-medium">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
              <span>{lead.address}</span>
            </div>
          )}

          {/* Property type + value */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Home className="w-3 h-3" />
              {getPropertyType(lead)}
            </span>
            {lead.property_value && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <DollarSign className="w-3 h-3" />
                {lead.property_value}
              </span>
            )}
          </div>

          {/* Contact info */}
          {hasContact && (
            <div className="space-y-0.5">
              {lead.owner_name && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-medium">Owner:</span> {lead.owner_name}
                </div>
              )}
              {lead.renter_name && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-medium">Renter:</span> {lead.renter_name}
                </div>
              )}
              {lead.commercial_name && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-medium">Business:</span> {lead.commercial_name}
                </div>
              )}
            </div>
          )}

          {/* Phone numbers */}
          {hasPhone && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <PhoneLink number={lead.owner_phone} label="Owner" />
              <PhoneLink number={lead.renter_phone} label="Renter" />
              <PhoneLink number={lead.commercial_phone} label="Business" />
            </div>
          )}

          {!hasContact && !hasPhone && (
            <p className="text-sm text-gray-400 italic">No contact info — door knock recommended</p>
          )}
        </div>
      </div>

      {/* Strategic brief */}
      <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 mb-3">
        <div className="flex items-start gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-sky-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-sky-800">{brief}</p>
        </div>
      </div>

      {/* Assignment + expand */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <>
              <label className="text-xs text-gray-400">Team:</label>
              <select
                value={lead.assigned_team || ''}
                onChange={(e) => handleTeamAssign(e.target.value)}
                disabled={saving}
                className="text-xs rounded-lg border border-gray-200 px-2 py-1 bg-white text-gray-700 cursor-pointer"
              >
                <option value="">Unassigned</option>
                {teams.filter((t) => t.id !== 'admin' && t.active).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <select
                value={lead.assigned_to || ''}
                onChange={(e) => handleMemberAssign(e.target.value)}
                disabled={saving}
                className="text-xs rounded-lg border border-gray-200 px-2 py-1 bg-white text-gray-700 cursor-pointer"
              >
                <option value="">No individual</option>
                {members.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="text-xs text-gray-400">Team:</label>
              <span className="text-xs font-medium text-navy bg-navy/5 px-2 py-1 rounded-lg">
                {teams.find((t) => t.id === lead.assigned_team)?.name || 'Unassigned'}
              </span>
              {lead.assigned_to && (
                <span className="text-xs text-gray-500">{lead.assigned_to}</span>
              )}
            </>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-navy transition-colors"
        >
          {expanded ? 'Less' : 'More'}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-2 text-sm">
          {lead.incident_number && (
            <div><span className="text-gray-400">Incident #:</span> <span className="font-mono text-gray-700">{lead.incident_number}</span></div>
          )}
          {lead.fire_department && (
            <div><span className="text-gray-400">Fire Dept:</span> <span className="text-gray-700">{lead.fire_department}</span></div>
          )}
          {lead.occupancy && (
            <div><span className="text-gray-400">Occupancy:</span> <span className="text-gray-700">{lead.occupancy}</span></div>
          )}
          {lead.property_details && (
            <div><span className="text-gray-400">Property:</span> <span className="text-gray-700">{lead.property_details}</span></div>
          )}
          {lead.owner_address && (
            <div><span className="text-gray-400">Owner Address:</span> <span className="text-gray-700">{lead.owner_address}</span></div>
          )}
          {lead.services && lead.services.length > 0 && (
            <div>
              <span className="text-gray-400">Services Needed:</span>
              <ul className="ml-4 mt-1 space-y-0.5">
                {lead.services.map((s, i) => (
                  <li key={i} className="text-gray-700">- {s}</li>
                ))}
              </ul>
            </div>
          )}
          {lead.notes && (
            <div>
              <span className="text-gray-400">FD Notes:</span>
              <p className="text-gray-700 mt-1 whitespace-pre-line">{lead.notes}</p>
            </div>
          )}

          {/* Call notes */}
          <NoteSection
            lead={lead}
            members={members}
            onNoteAdded={(note) => onUpdate(lead.id, { call_notes: [...(lead.call_notes || []), note] })}
          />

          {/* Collapsible call script */}
          <details className="bg-amber-50 border border-amber-200 rounded-xl mt-2">
            <summary className="px-3 py-2 text-xs font-semibold text-amber-700 cursor-pointer select-none hover:bg-amber-100 rounded-xl transition-colors">
              Call Script
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <p className="text-xs font-semibold text-amber-700">Opening</p>
              <p className="text-sm text-amber-900 italic">
                "Hi, is this {lead.owner_name || lead.renter_name || '[OWNER NAME]'}? My name is [YOUR NAME], I'm calling from 1-800-Packouts. We work with insurance companies and fire departments here in the Valley. I heard about the {isFire ? 'fire' : 'incident'} at your home on {streetName || '[STREET]'} and I just wanted to reach out and see how you're doing."
              </p>
              <p className="text-xs font-semibold text-amber-700 mt-2">Discovery (in order)</p>
              <ol className="text-xs text-amber-800 space-y-0.5 list-decimal ml-4">
                <li>"Are you and your family safe? Is everyone okay?"</li>
                <li>"Have you been able to get back into the home?"</li>
                <li>"Has your insurance company been in touch yet?"</li>
                <li>"Do you know who your carrier is?" → <em>Log carrier</em></li>
                <li>"Have they assigned you an adjuster?" → <em>Log adjuster name/phone</em></li>
                <li>"Has anyone else reached out about protecting your belongings?" → <em>Log competitor</em></li>
                <li>"Do you have a GC handling the rebuild?" → <em>Log GC name</em></li>
              </ol>
              <p className="text-xs font-semibold text-amber-700 mt-2">Close</p>
              <p className="text-xs text-amber-900 italic">
                "I really appreciate you talking to me. What we do is we come in and carefully pack up all your belongings — clothes, furniture, electronics, family photos, everything salvageable — and we store it safely while your home is being repaired. Your insurance covers it, so there's no out-of-pocket cost to you. I'm going to have our operations team reach out — is this the best number? And is there a good time for them to call?"
              </p>
              <p className="text-xs font-semibold text-amber-700 mt-2">If Voicemail</p>
              <p className="text-xs text-amber-900 italic">
                "Hi {lead.owner_name || '[OWNER NAME]'}, this is [YOUR NAME] from 1-800-Packouts. We work with insurance companies and fire departments in the area, and I'm calling about the {isFire ? 'fire' : 'incident'} at your home on {streetName || '[STREET]'}. We help protect and store your belongings while your home is being repaired, and it's covered by your insurance. If you'd like to learn more, please call or text us back at 623-300-2119. I hope you and your family are doing well."
              </p>
              <p className="text-xs text-amber-600 mt-1">After call: text azfirehelp.com link</p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function MetricsTab({ leads, teams }: { leads: FireLead[]; teams: TeamConfig[] }) {
  const metrics = useMemo(() => {
    const total = leads.length;
    const byStatus: Record<string, number> = {};
    const byCity: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    const byAssignee: Record<string, number> = {};
    const byTeam: Record<string, number> = {};
    let withPhone = 0;
    let totalNotes = 0;

    for (const l of leads) {
      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      if (l.city) byCity[l.city] = (byCity[l.city] || 0) + 1;
      if (l.assigned_to) byAssignee[l.assigned_to] = (byAssignee[l.assigned_to] || 0) + 1;
      if (l.assigned_team) byTeam[l.assigned_team] = (byTeam[l.assigned_team] || 0) + 1;
      if (l.owner_phone || l.renter_phone || l.commercial_phone) withPhone++;
      totalNotes += (l.call_notes || []).length;

      const month = l.date?.substring(0, 7); // YYYY-MM
      if (month) byMonth[month] = (byMonth[month] || 0) + 1;
    }

    const contacted = (byStatus['contacted'] || 0) + (byStatus['pursuing'] || 0) + (byStatus['converted'] || 0) + (byStatus['not_interested'] || 0);
    const contactRate = total > 0 ? Math.round((contacted / total) * 100) : 0;
    const conversionRate = total > 0 ? Math.round(((byStatus['converted'] || 0) / total) * 100) : 0;
    const pursuing = (byStatus['pursuing'] || 0) + (byStatus['converted'] || 0);
    const pursuitRate = contacted > 0 ? Math.round((pursuing / contacted) * 100) : 0;

    const topCities = Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const months = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));

    return { total, byStatus, contactRate, conversionRate, pursuitRate, contacted, withPhone, totalNotes, topCities, months, byAssignee, byTeam };
  }, [leads]);

  const funnelSteps = [
    { label: 'Total Leads', count: metrics.total, color: 'bg-blue-500' },
    { label: 'Contacted', count: metrics.contacted, color: 'bg-yellow-500' },
    { label: 'Pursuing', count: (metrics.byStatus['pursuing'] || 0) + (metrics.byStatus['converted'] || 0), color: 'bg-purple-500' },
    { label: 'Converted', count: metrics.byStatus['converted'] || 0, color: 'bg-emerald-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Total Leads</p>
          <p className="text-3xl font-bold text-navy mt-1">{metrics.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Contact Rate</p>
          <p className="text-3xl font-bold text-navy mt-1">{metrics.contactRate}%</p>
          <p className="text-[10px] text-gray-400">{metrics.contacted} of {metrics.total} reached</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Pursuit Rate</p>
          <p className="text-3xl font-bold text-navy mt-1">{metrics.pursuitRate}%</p>
          <p className="text-[10px] text-gray-400">of contacted → pursuing+</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Converted</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">{metrics.byStatus['converted'] || 0}</p>
          <p className="text-[10px] text-gray-400">{metrics.conversionRate}% of total</p>
        </div>
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4" />
          Conversion Funnel
        </h2>
        <div className="space-y-3">
          {funnelSteps.map((step) => {
            const pct = metrics.total > 0 ? (step.count / metrics.total) * 100 : 0;
            return (
              <div key={step.label} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-24 text-right">{step.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div className={`${step.color} h-full rounded-full transition-all flex items-center justify-end pr-2`} style={{ width: `${Math.max(pct, 4)}%` }}>
                    <span className="text-[10px] text-white font-semibold">{step.count}</span>
                  </div>
                </div>
                <span className="text-xs text-gray-400 w-12">{Math.round(pct)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status breakdown + activity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Status Breakdown</h2>
          <div className="space-y-2">
            {STATUS_OPTIONS.map((o) => (
              <div key={o.value} className="flex items-center justify-between">
                <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${o.color}`}>{o.label}</span>
                <span className="text-sm font-medium text-gray-700">{metrics.byStatus[o.value] || 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <UsersIcon className="w-4 h-4" />
            By Team
          </h2>
          <div className="space-y-2">
            {teams.filter((t) => t.id !== 'admin' && t.active).map((t) => (
              <div key={t.id} className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-600">{t.name}</span>
                  {t.members.length > 0 && (
                    <span className="text-[10px] text-gray-400 ml-1.5">({t.members.join(', ')})</span>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700">{metrics.byTeam[t.id] || 0}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-sm text-gray-400">Unassigned</span>
              <span className="text-sm font-medium text-gray-700">{metrics.total - Object.values(metrics.byTeam).reduce((a, b) => a + b, 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top cities + monthly volume */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <MapPin className="w-4 h-4" />
            Top Cities
          </h2>
          <div className="space-y-2">
            {metrics.topCities.map(([city, count]) => (
              <div key={city} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{city}</span>
                <span className="text-sm font-medium text-gray-700">{count}</span>
              </div>
            ))}
            {metrics.topCities.length === 0 && <p className="text-sm text-gray-400">No city data</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" />
            Monthly Volume
          </h2>
          <div className="space-y-2">
            {metrics.months.map(([month, count]) => {
              const label = new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
              const pct = metrics.total > 0 ? (count / metrics.total) * 100 : 0;
              return (
                <div key={month} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div className="bg-navy h-full rounded-full" style={{ width: `${Math.max(pct, 3)}%` }} />
                  </div>
                  <span className="text-xs text-gray-600 w-6 text-right">{count}</span>
                </div>
              );
            })}
            {metrics.months.length === 0 && <p className="text-sm text-gray-400">No date data</p>}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Activity Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-navy">{metrics.withPhone}</p>
            <p className="text-xs text-gray-400">Have Phone #</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-navy">{metrics.total - metrics.withPhone}</p>
            <p className="text-xs text-gray-400">Need Door Knock</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-navy">{metrics.totalNotes}</p>
            <p className="text-xs text-gray-400">Total Notes Logged</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-navy">{metrics.byStatus['no_answer'] || 0}</p>
            <p className="text-xs text-gray-400">No Answer</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrainingTab() {
  return (
    <div className="space-y-6">
      {/* Quick Reference */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Fire Leads Quick Reference</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Response SLA</h3>
            <ul className="space-y-1 text-gray-600">
              <li>- Goal: <span className="font-medium">30 minutes</span> from alert</li>
              <li>- Minimum: next morning by <span className="font-medium">noon</span></li>
              <li>- Speed wins — first vendor to connect usually gets the job</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Daily Schedule (AZ/MST)</h3>
            <ul className="space-y-1 text-gray-600">
              <li>- 7:00-7:15 — Check fire leads queue (priority 1)</li>
              <li>- 7:15-9:00 — Call new overnight/morning leads</li>
              <li>- 2:00-3:30 — Follow-ups & callbacks</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Mindset</h3>
            <ul className="space-y-1 text-gray-600">
              <li>- You are NOT selling — you are offering help</li>
              <li>- Empathy first, always</li>
              <li>- Never close, never promise, never improvise</li>
              <li>- Gather intel, log everything, hand off to ops</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">After Every Call</h3>
            <ul className="space-y-1 text-gray-600">
              <li>- Log notes in HubSpot immediately</li>
              <li>- Text azfirehelp.com link to homeowner</li>
              <li>- If voicemail: follow up in 2 days, max 3 attempts</li>
              <li>- Flag hot leads in daily summary</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Call Script */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Script: Fire Lead — Homeowner</h2>

        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold text-amber-700">Opening</h3>
            <p className="text-gray-700 mt-1 italic bg-amber-50 p-3 rounded-lg">
              "Hi, is this [OWNER NAME]? My name is [YOUR NAME], I'm calling from 1-800-Packouts. We work with insurance companies and fire departments here in the Valley. I heard about the fire at your home on [STREET] and I just wanted to reach out and see how you're doing."
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-amber-700">If asked "How did you get my number?"</h3>
            <p className="text-gray-700 mt-1 italic bg-amber-50 p-3 rounded-lg">
              "We work closely with local fire departments and monitor fire incidents in the area so we can offer help to families who need it. We're an insurance-approved vendor — we don't charge you anything directly."
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-amber-700">Discovery Questions (in order)</h3>
            <ol className="text-gray-700 mt-1 space-y-1 list-decimal ml-4">
              <li>"Are you and your family safe? Is everyone okay?" <em className="text-gray-400">— always first</em></li>
              <li>"Have you been able to get back into the home at all, or are you displaced right now?"</li>
              <li>"Has your insurance company been in touch yet?"</li>
              <li>"Do you know who your insurance carrier is?" → <em className="text-gray-400">Log: carrier name</em></li>
              <li>"Have they assigned you an adjuster yet? Do you have their name?" → <em className="text-gray-400">Log: adjuster name + phone</em></li>
              <li>"Has anyone else reached out to you about protecting your belongings — like a restoration company or a packout company?" → <em className="text-gray-400">Log: competitor name</em></li>
              <li>"Do you have a general contractor or restoration company handling the rebuild?" → <em className="text-gray-400">Log: GC name</em></li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-amber-700">Close (always the same)</h3>
            <p className="text-gray-700 mt-1 italic bg-amber-50 p-3 rounded-lg">
              "I really appreciate you talking to me. What we do is we come in and carefully pack up all your belongings — clothes, furniture, electronics, family photos, everything salvageable — and we store it safely while your home is being repaired. Your insurance covers it, so there's no out-of-pocket cost to you. I'm going to have our operations team reach out to you — is this the best number? And is there a good time for them to call?"
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-amber-700">If already have a packout company</h3>
            <p className="text-gray-700 mt-1 italic bg-amber-50 p-3 rounded-lg">
              "No problem at all. Who are you working with? ... Great. Well if anything changes or you need a second opinion, we're always available. I'll send you a quick text with our info just in case."
            </p>
            <p className="text-xs text-gray-400 mt-1">Log competitor name, then move on. Don't push.</p>
          </div>

          <div>
            <h3 className="font-semibold text-amber-700">Voicemail</h3>
            <p className="text-gray-700 mt-1 italic bg-amber-50 p-3 rounded-lg">
              "Hi [OWNER NAME], this is [YOUR NAME] from 1-800-Packouts. We work with insurance companies and fire departments in the area, and I'm calling about the fire at your home on [STREET]. We help protect and store your belongings while your home is being repaired, and it's covered by your insurance. If you'd like to learn more, please call or text us back at 623-300-2119. I hope you and your family are doing well."
            </p>
            <p className="text-xs text-gray-400 mt-1">Log: "Left VM" + date/time. Follow up in 2 days. Max 3 attempts.</p>
          </div>
        </div>
      </div>

      {/* Training Resources */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Training Resources</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="https://docs.google.com/spreadsheets/d/11FojZ8VoxD9UlsEqm4pbELDWGNZEzSI-9Zok4Xt7MM4/edit"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 hover:border-navy/30 hover:bg-gray-50 transition-all group"
          >
            <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-navy" />
            <div>
              <div className="text-sm font-semibold text-gray-700 group-hover:text-navy">Onboarding Tracker</div>
              <div className="text-xs text-gray-400">Daily plan, KPIs, training log</div>
            </div>
          </a>
          <a
            href="https://sdr-onboard.web.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 hover:border-navy/30 hover:bg-gray-50 transition-all group"
          >
            <GraduationCap className="w-4 h-4 text-gray-400 group-hover:text-navy" />
            <div>
              <div className="text-sm font-semibold text-gray-700 group-hover:text-navy">SDR Dashboard</div>
              <div className="text-xs text-gray-400">Training lessons & KPI tracking</div>
            </div>
          </a>
          <a
            href="https://azfirehelp.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 hover:border-navy/30 hover:bg-gray-50 transition-all group"
          >
            <Flame className="w-4 h-4 text-gray-400 group-hover:text-navy" />
            <div>
              <div className="text-sm font-semibold text-gray-700 group-hover:text-navy">AZ Fire Help</div>
              <div className="text-xs text-gray-400">Homeowner resource site — text after every call</div>
            </div>
          </a>
        </div>
      </div>

      {/* Escalation Rules */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Escalation Rules</h2>
        <div className="space-y-3 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <span className="text-red-500 font-bold">!</span>
            <p><span className="font-medium">Homeowner says "I need help today"</span> — immediately message Matt + Diana in GChat. Don't schedule a callback, don't say "someone will call you." Get Matt on the phone now.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-500 font-bold">!</span>
            <p><span className="font-medium">Insurance adjuster asks for scope/estimate</span> — hand off to Matt. You do not discuss pricing, scope, or estimates.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-500 font-bold">!</span>
            <p><span className="font-medium">GC/restoration co says "we need packout on a job this week"</span> — warm transfer or have Matt call back within the hour.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AZ Fire Help tab — marketing materials & resources
// ---------------------------------------------------------------------------

const fireHelpResources = [
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

function AZFireHelpTab() {
  return (
    <div className="space-y-6">
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
        {fireHelpResources.map((item) => {
          const Icon = item.icon;
          return (
            <a
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
            </a>
          );
        })}
      </div>

      {/* Print instructions */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-orange-800 mb-2">Brochure Print Instructions</h3>
        <ul className="text-sm text-orange-700 space-y-1.5 leading-relaxed">
          <li>&bull; Print double-sided on letter paper (8.5&times;11)</li>
          <li>&bull; PDF is already landscape-formatted &mdash; no printer settings to change</li>
          <li>&bull; Fold into thirds: right panel in first, then left panel over it</li>
          <li>&bull; Front cover faces out, inside flap is first thing seen when opened</li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function FireLeadList() {
  const { session, loading: teamLoading, authenticate, logout: teamLogout, teams } = useTeamAuth();
  const [leads, setLeads] = useState<FireLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [viewTab, setViewTab] = useState<ViewTab>('leads');

  // Gather all unique member names across teams for admin view
  const allMembers = useMemo(() => {
    const set = new Set<string>();
    teams.forEach((t) => t.members.forEach((m) => set.add(m)));
    return Array.from(set);
  }, [teams]);

  // Members for current session
  const sessionMembers = session?.isAdmin ? allMembers : (session?.members || []);

  useEffect(() => {
    if (!session) return;
    getMcpClient('xcelerate')
      .callTool<FireLead[]>('list_fireleads', { limit: 200 })
      .then(setLeads)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [session]);

  const handleUpdate = (id: string, patch: Partial<FireLead>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  // Deduplicate by incident_number (keep the first/newest)
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    return leads.filter((lead) => {
      if (!lead.incident_number) return true;
      if (seen.has(lead.incident_number)) return false;
      seen.add(lead.incident_number);
      return true;
    });
  }, [leads]);

  const filtered = useMemo(() => {
    let result = deduped.filter((lead) => {
      // Team visibility: non-admin users only see their team's leads
      if (session && !session.isAdmin && lead.assigned_team !== session.teamId) return false;
      if (filter !== 'all' && lead.status !== filter) return false;
      // Admin team filter
      if (session?.isAdmin && teamFilter !== 'all') {
        if (teamFilter === 'unassigned') {
          if (lead.assigned_team) return false;
        } else {
          if (lead.assigned_team !== teamFilter) return false;
        }
      }
      // Individual assignee filter
      if (assigneeFilter !== 'all') {
        if (assigneeFilter === 'unassigned') {
          if (lead.assigned_to) return false;
        } else {
          if (lead.assigned_to !== assigneeFilter) return false;
        }
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          lead.address?.toLowerCase().includes(q) ||
          lead.city?.toLowerCase().includes(q) ||
          lead.owner_name?.toLowerCase().includes(q) ||
          lead.renter_name?.toLowerCase().includes(q) ||
          lead.incident_number?.toLowerCase().includes(q)
        );
      }
      return true;
    });

    // Sort
    result = [...result].sort((a, b) => {
      switch (sort) {
        case 'newest':
          return (b.date || '').localeCompare(a.date || '');
        case 'oldest':
          return (a.date || '').localeCompare(b.date || '');
        case 'city_az':
          return (a.city || 'zzz').localeCompare(b.city || 'zzz');
        case 'city_za':
          return (b.city || '').localeCompare(a.city || '');
        default:
          return 0;
      }
    });

    return result;
  }, [deduped, filter, teamFilter, assigneeFilter, search, sort, session]);

  // Show PIN gate if not authenticated (after all hooks)
  if (teamLoading) {
    return (
      <div className="min-h-screen bg-warm flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-navy animate-spin" />
      </div>
    );
  }
  if (!session) return <TeamPinGate onSubmit={authenticate} />;

  // Count per status for badges (use deduped)
  const counts: Record<string, number> = { all: deduped.length };
  for (const l of deduped) {
    counts[l.status] = (counts[l.status] || 0) + 1;
  }

  return (
    <div className="min-h-screen bg-warm">
      <header className="bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-3">
            <Link to="/" className="inline-flex items-center gap-1 text-white/60 hover:text-white text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Hub
            </Link>
            <button
              onClick={teamLogout}
              className="inline-flex items-center gap-1.5 text-white/50 hover:text-white text-xs transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Switch Team
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Fire Leads</h1>
              <p className="text-sm text-white/60">Live leads from fireleads.com</p>
            </div>
            <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
              {session.isAdmin ? (
                <Shield className="w-3.5 h-3.5 text-gold" />
              ) : (
                <UsersIcon className="w-3.5 h-3.5 text-white/60" />
              )}
              <span className="text-sm font-medium">{session.teamName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* View tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setViewTab('leads')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                viewTab === 'leads'
                  ? 'border-navy text-navy'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Lead Feed
              {deduped.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                  {deduped.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewTab('metrics')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                viewTab === 'metrics'
                  ? 'border-navy text-navy'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5" />
                Metrics
              </span>
            </button>
            <button
              onClick={() => setViewTab('training')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                viewTab === 'training'
                  ? 'border-navy text-navy'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5" />
                Training
              </span>
            </button>
            <button
              onClick={() => setViewTab('azfirehelp')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                viewTab === 'azfirehelp'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" />
                AZ Fire Help
              </span>
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {viewTab === 'metrics' && <MetricsTab leads={session.isAdmin ? deduped : deduped.filter((l) => l.assigned_team === session.teamId)} teams={teams} />}
        {viewTab === 'training' && <TrainingTab />}
        {viewTab === 'azfirehelp' && <AZFireHelpTab />}

        {viewTab === 'leads' && (
          <>
            {/* Search + sort */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by address, name, or incident #..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-navy/40 focus:ring-1 focus:ring-navy/20"
                />
              </div>
              <div className="flex items-center gap-2">
                {session.isAdmin && (
                  <select
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                    className="text-sm rounded-lg border border-gray-200 px-3 py-2 bg-white text-gray-700 cursor-pointer"
                  >
                    <option value="all">All Teams</option>
                    {teams.filter((t) => t.id !== 'admin' && t.active).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                    <option value="unassigned">Unassigned</option>
                  </select>
                )}
                <select
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  className="text-sm rounded-lg border border-gray-200 px-3 py-2 bg-white text-gray-700 cursor-pointer"
                >
                  <option value="all">All Assignees</option>
                  {sessionMembers.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="unassigned">Unassigned</option>
                </select>
                <ArrowUpDown className="w-4 h-4 text-gray-400" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="text-sm rounded-lg border border-gray-200 px-3 py-2 bg-white text-gray-700 cursor-pointer"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter chips + route button */}
            <div className="flex gap-2 flex-wrap mb-6 items-center">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'all' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy/30'
                }`}
              >
                All <span className="ml-1 text-xs opacity-60">{counts.all || 0}</span>
              </button>
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setFilter(o.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === o.value ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy/30'
                  }`}
                >
                  {o.label} {counts[o.value] ? <span className="ml-1 text-xs opacity-60">{counts[o.value]}</span> : null}
                </button>
              ))}

              {/* Route optimization button */}
              {(() => {
                const routableLeads = filtered.filter((l) => l.address && ['new', 'contacted', 'pursuing', 'no_answer'].includes(l.status));
                if (routableLeads.length === 0) return null;
                const waypoints = routableLeads.slice(0, 25).map((l) => encodeURIComponent(l.address!));
                // Google Maps directions URL: first address as origin, last as destination, rest as optimized waypoints
                const origin = waypoints[0];
                const destination = waypoints.length > 1 ? waypoints[waypoints.length - 1] : origin;
                const middle = waypoints.length > 2 ? waypoints.slice(1, -1).join('|') : '';
                const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${middle ? `&waypoints=${middle}&optimize_waypoints=true` : ''}`;
                return (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Route {routableLeads.length > 25 ? '25' : routableLeads.length} Stops
                  </a>
                );
              })()}
            </div>

            {/* States */}
            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-navy animate-spin" />
                <span className="ml-3 text-gray-500">Loading fire leads...</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
                Failed to load leads: {error}
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <p className="text-gray-400 text-center py-16">
                {deduped.length === 0
                  ? 'No fire leads yet. Run the processor to import leads from Gmail.'
                  : 'No leads match your filter.'}
              </p>
            )}

            {/* Lead cards */}
            {!loading && !error && filtered.length > 0 && (
              <div className="grid gap-4">
                {filtered.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} onUpdate={handleUpdate} isAdmin={session.isAdmin} teams={teams} members={sessionMembers} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
