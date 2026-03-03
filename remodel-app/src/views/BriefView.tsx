import type { BudgetLineItem, Decision } from '../types';
import { Home, Bath, DoorOpen, Clock, DollarSign, Wrench, HelpCircle, Users } from 'lucide-react';

interface BriefViewProps {
  budget: BudgetLineItem[];
  decisions: Decision[];
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const milestones = [
  { week: '1–2', label: 'Source & Demo', detail: 'Order materials, tear out old shower + closet cabinets' },
  { week: '3', label: 'Frame & Plumbing', detail: 'New shower framing, drain + supply lines, brick cut for door' },
  { week: '4–5', label: 'Tile', detail: 'The big transformation — shower floor, walls, bench, wainscot' },
  { week: '6', label: 'Glass & Doors', detail: 'Shower glass door installed, 3 new interior doors, drywall patched' },
  { week: '7', label: 'Paint & Finish', detail: 'Paint, blinds, light fixtures, thermostat, hardware, trim' },
  { week: '8', label: 'Done', detail: 'Punch list, furniture back in, clean' },
];

export function BriefView({ budget, decisions }: BriefViewProps) {
  const laborItems = budget.filter(b => b.category === 'Labor');
  const materialItems = budget.filter(b => b.category === 'Materials');
  const contingencyItems = budget.filter(b => b.category === 'Contingency');

  const totalLow = budget.reduce((s, b) => s + b.estimateLow, 0);
  const totalHigh = budget.reduce((s, b) => s + b.estimateHigh, 0);
  const totalMid = Math.round((totalLow + totalHigh) / 2);

  const laborLow = laborItems.reduce((s, b) => s + b.estimateLow, 0);
  const laborHigh = laborItems.reduce((s, b) => s + b.estimateHigh, 0);
  const matLow = materialItems.reduce((s, b) => s + b.estimateLow, 0);
  const matHigh = materialItems.reduce((s, b) => s + b.estimateHigh, 0);
  const contLow = contingencyItems.reduce((s, b) => s + b.estimateLow, 0);
  const contHigh = contingencyItems.reduce((s, b) => s + b.estimateHigh, 0);

  const openDecisions = decisions.filter(d => d.status === 'TBD');

  return (
    <div className="brief-view max-w-2xl mx-auto space-y-8 animate-fade-in pb-12">

      {/* ── HEADER ── */}
      <div className="text-center pt-4">
        <h1 className="text-2xl font-bold text-slate-dark tracking-tight">Primary Suite Remodel</h1>
        <p className="text-sm text-copper font-medium mt-1">8 Weeks — March 3 to April 21, 2026</p>
        <div className="w-16 h-0.5 bg-copper mx-auto mt-3" />
      </div>

      {/* ── THE VISION ── */}
      <section className="brief-section">
        <p className="text-base text-slate-dark leading-relaxed">
          Our 74-year-old primary suite is getting a complete refresh. The cramped shower stall becomes a full-width
          walk-in with a tiled bench, glass door, and limewash walls. The bedroom gets a new aluminum door
          opening to the yard, a built-in IKEA PAX closet system, and fresh paint. The hallway connects
          it all with new doors, lighting, and a smart thermostat. Eight weeks, start to finish.
        </p>
      </section>

      {/* ── WHAT'S CHANGING ── */}
      <section className="brief-section">
        <h2 className="brief-heading">What's Changing</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Bedroom */}
          <div className="bg-white rounded-xl border border-warm-dark p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-copper/10 flex items-center justify-center">
                <Home size={16} className="text-copper" />
              </div>
              <h3 className="text-sm font-bold text-slate-dark">Bedroom</h3>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-dark">
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-copper mt-2 flex-shrink-0" />
                <span>Window converted to aluminum outswing door</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-copper mt-2 flex-shrink-0" />
                <span>Built-in PAX closet system (custom fronts later)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-copper mt-2 flex-shrink-0" />
                <span>Fresh paint + dual roller blinds</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-copper mt-2 flex-shrink-0" />
                <span>Remaining window pinned fixed (door is egress)</span>
              </li>
            </ul>
          </div>

          {/* Hallway */}
          <div className="bg-white rounded-xl border border-warm-dark p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <DoorOpen size={16} className="text-blue-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-dark">Hallway</h3>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-dark">
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span>3 new prehung interior doors</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span>New light fixture</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span>Smart thermostat (relocated to hallway)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span>Fresh paint (same color as bedroom)</span>
              </li>
            </ul>
          </div>

          {/* Bathroom */}
          <div className="bg-white rounded-xl border border-warm-dark p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-sage/20 flex items-center justify-center">
                <Bath size={16} className="text-sage" />
              </div>
              <h3 className="text-sm font-bold text-slate-dark">Bathroom</h3>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-dark">
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-sage mt-2 flex-shrink-0" />
                <span>Full-width walk-in shower with bench</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-sage mt-2 flex-shrink-0" />
                <span>Glass door (fixed panel + hinged)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-sage mt-2 flex-shrink-0" />
                <span>Limewash walls above tile wainscot</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-sage mt-2 flex-shrink-0" />
                <span>New exhaust fan, light fixture, sink hardware</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-sage mt-2 flex-shrink-0" />
                <span>Existing wainscot + cabinet + toilet preserved</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── TIMELINE ── */}
      <section className="brief-section">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-copper" />
          <h2 className="brief-heading mb-0">Timeline</h2>
        </div>

        <div className="relative">
          {/* Progress track */}
          <div className="absolute left-[22px] top-3 bottom-3 w-0.5 bg-warm-dark" />

          <div className="space-y-0">
            {milestones.map((m, i) => (
              <div key={i} className="flex items-start gap-4 py-2.5">
                <div className="flex-shrink-0 relative z-10">
                  <div className={`w-[45px] h-[45px] rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${
                    i === milestones.length - 1
                      ? 'bg-sage text-white border-sage'
                      : 'bg-white text-slate-dark border-copper'
                  }`}>
                    W{m.week}
                  </div>
                </div>
                <div className="pt-1.5">
                  <p className="text-sm font-semibold text-slate-dark">{m.label}</p>
                  <p className="text-xs text-slate-light mt-0.5">{m.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BUDGET ── */}
      <section className="brief-section">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={18} className="text-copper" />
          <h2 className="brief-heading mb-0">Budget</h2>
        </div>

        <div className="bg-white rounded-xl border border-warm-dark p-5">
          {/* Total */}
          <div className="text-center mb-5">
            <p className="text-[10px] text-slate-light uppercase tracking-widest">Estimated Total</p>
            <p className="text-3xl font-bold text-copper mt-1">{fmt(totalMid)}</p>
            <p className="text-xs text-slate-light mt-0.5">Range: {fmt(totalLow)} – {fmt(totalHigh)}</p>
          </div>

          {/* Category bars */}
          <div className="space-y-3">
            <BudgetBar label="Labor" low={laborLow} high={laborHigh} total={totalHigh} color="bg-blue-500" />
            <BudgetBar label="Materials" low={matLow} high={matHigh} total={totalHigh} color="bg-amber-500" />
            <BudgetBar label="Contingency (10%)" low={contLow} high={contHigh} total={totalHigh} color="bg-gray-400" />
          </div>

          {/* Labor breakdown */}
          <div className="mt-4 pt-4 border-t border-warm-dark">
            <p className="text-[10px] text-slate-light uppercase tracking-wide mb-2">Labor Breakdown</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              {laborItems.map(item => (
                <div key={item._row}>
                  <p className="text-xs font-medium text-slate-dark">{item.trade}</p>
                  <p className="text-sm font-bold text-slate-dark">{fmt(item.estimateLow)}–{fmt(item.estimateHigh)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Callout */}
          <div className="mt-4 bg-copper/5 rounded-lg p-3 text-center">
            <p className="text-xs text-copper font-medium">No general contractor markup — managing the project directly</p>
          </div>
        </div>
      </section>

      {/* ── DESIGN DECISIONS ── */}
      <section className="brief-section">
        <div className="flex items-center gap-2 mb-4">
          <Wrench size={18} className="text-copper" />
          <h2 className="brief-heading mb-0">Design Decisions</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SpecCard title="Shower" detail="Full-width walk-in with mud-set pan, large format field tile, built-in bench and shelves" />
          <SpecCard title="Glass Door" detail="Fixed panel on left, hinged door on right — frameless or semi-frameless" />
          <SpecCard title="Closet" detail="IKEA PAX carcasses with stock doors now, Semihandmade custom fronts added later" />
          <SpecCard title="Exterior Door" detail="Outswing aluminum, single lite, contemporary style — 39&quot; opening, existing lintel" />
          <SpecCard title="Walls (Bathroom)" detail="Existing tile wainscot preserved + extended. Limewash finish above wainscot and ceiling" />
          <SpecCard title="Blinds" detail="Dual roller (sheer + blackout) with low-profile cassette — on window and new door" />
        </div>
      </section>

      {/* ── STILL TBD ── */}
      {openDecisions.length > 0 && (
        <section className="brief-section">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle size={18} className="text-amber-500" />
            <h2 className="brief-heading mb-0">Still to Decide</h2>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {openDecisions.map(d => (
                <div key={d._row} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-dark">{d.decision}</p>
                    <p className="text-[10px] text-slate-light">{d.options}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── THE TEAM ── */}
      <section className="brief-section">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-copper" />
          <h2 className="brief-heading mb-0">The Team</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="bg-copper/5 rounded-xl border border-copper/20 p-4">
            <p className="text-sm font-semibold text-copper">Matt — Project Manager</p>
            <p className="text-xs text-slate-light mt-1">Sourcing materials, scheduling trades, coordinating the work. On-site oversight throughout.</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
            <p className="text-sm font-semibold text-blue-700">Carpenter — All Trades</p>
            <p className="text-xs text-slate-light mt-1">Trusted carpenter handling everything hands-on: demo, framing, plumbing, electrical, doors, paint, trim, and finish.</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
            <p className="text-sm font-semibold text-amber-700">Tile Installer — Sub</p>
            <p className="text-xs text-slate-light mt-1">Specialist for shower tile, wainscot extension, and grouting. Biggest visual impact of the project.</p>
          </div>
          <div className="bg-cyan-50 rounded-xl border border-cyan-200 p-4">
            <p className="text-sm font-semibold text-cyan-700">Glass Company — Sub</p>
            <p className="text-xs text-slate-light mt-1">Custom measure and install of the glass shower door — fixed panel and hinged door.</p>
          </div>
        </div>
      </section>

      {/* ── PRACTICAL NOTES ── */}
      <section className="brief-section">
        <h2 className="brief-heading">Good to Know</h2>
        <div className="bg-white rounded-xl border border-warm-dark p-4 space-y-2">
          <NoteItem text="A second bathroom is available during construction — primary bath will be out of service for ~6 weeks (Weeks 2–7)." />
          <NoteItem text="Dust containment: plastic sheeting will separate the work zone from the rest of the house during demo and tile." />
          <NoteItem text="No permits required — window-to-door conversion has an existing lintel. Owner-occupied AZ home, minor plumbing/electrical within existing walls." />
          <NoteItem text="10% contingency built in for a 74-year-old house — expect at least one surprise behind the walls." />
          <NoteItem text="Budget contingency covers unknowns. If we come in clean, that money stays in the bank." />
        </div>
      </section>

      {/* ── FOOTER ── */}
      <div className="text-center pt-4 pb-8 border-t border-warm-dark">
        <p className="text-xs text-slate-light">Primary Suite Remodel — March to April 2026</p>
      </div>
    </div>
  );
}

function BudgetBar({ label, low, high, total, color }: { label: string; low: number; high: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((high / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-medium text-slate-dark">{label}</span>
        <span className="text-xs text-slate-light">{fmt(low)} – {fmt(high)}</span>
      </div>
      <div className="w-full bg-warm-dark rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SpecCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="bg-white rounded-lg border border-warm-dark p-3">
      <p className="text-xs font-semibold text-copper">{title}</p>
      <p className="text-sm text-slate-dark mt-1">{detail}</p>
    </div>
  );
}

function NoteItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-1 h-1 rounded-full bg-slate-light mt-2 flex-shrink-0" />
      <p className="text-sm text-slate-dark">{text}</p>
    </div>
  );
}
