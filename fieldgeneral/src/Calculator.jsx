import { useState } from "react";
import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const fmt = (n) => "$" + Math.round(n).toLocaleString();
const SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzGOk2sdvj5Ckxyf5dvb_QnG6EV2r94z_uGlRJJY4gkREVMzg98dW0SYSPYv48tDvSG/exec";

export default function App() {
  return (
    <div className="fg">
      <Nav />
      <Hero />
      <CalculatorSection />
      <Features />
      <Problem />
      <HowItWorks />
      <Results />
      <Pricing />
      <FAQ />
      <BottomCTA />
      <Footer />
    </div>
  );
}

/* ─── NAV ─── */
function Nav() {
  return (
    <nav>
      <div className="nav-inner">
        <div className="logo">FIELDGENERAL<span style={{ color: "#0b7a4b" }}>.ai</span></div>
        <div className="nav-links">
          <a href="#how">How It Works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href="#calculator" className="nav-cta">Run Your Numbers</a>
        </div>
      </div>
    </nav>
  );
}

/* ─── HERO ─── */
function Hero() {
  return (
    <section className="hero">
      <div className="wrap">
        <div className="hero-layout">
          <div className="hero-text">
            <div className="section-label">FIELDGENERAL</div>
            <h1>You're owed more money than you think</h1>
            <p>Restoration contractors leave six figures on the table every year. Slow collections, unbilled work, insurance cuts nobody fights. We fix that.</p>
            <a href="#calculator" className="hero-cta">See what you're missing</a>
            <span className="hero-sub">Free. 60 seconds. No account needed.</span>
          </div>
          <div className="hero-visual">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── DASHBOARD MOCKUP (hero visual) ─── */
function DashboardMockup() {
  return (
    <div className="mock-dashboard">
      <div className="mock-header">
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#0b7a4b", letterSpacing: "0.08em" }}>FIELDGENERAL</div>
          <div style={{ fontSize: 7, color: "#aaa" }}>Updated Mon 7 AM</div>
        </div>
        <div className="mock-score">71</div>
      </div>
      <div className="mock-metrics">
        <div className="mock-metric"><div className="mock-metric-label">TOTAL OWED</div><div className="mock-metric-value">$132,627</div></div>
        <div className="mock-metric"><div className="mock-metric-label">COLLECTED</div><div className="mock-metric-value" style={{ color: "#0b7a4b" }}>$46,471</div></div>
      </div>
      <div className="mock-bar">
        {[25, 35, 22, 12, 6].map((p, i) => <div key={i} style={{ flex: p, background: i < 2 ? "#0b7a4b" : i < 3 ? "#b8860b" : "#c44" }} />)}
      </div>
      <div className="mock-bar-labels">
        {["Current", "1-30", "31-60", "61-90", "90+"].map((l, i) => (
          <span key={i} style={{ color: i < 2 ? "#0b7a4b" : i < 3 ? "#b8860b" : "#c44" }}>{l}</span>
        ))}
      </div>
      <div className="mock-alerts">
        <div className="mock-alert mock-alert-red">Bryant - $61K overdue 113 days. Escalate to carrier supervisor.</div>
        <div className="mock-alert mock-alert-amber">Mae - $36K, no adjuster response in 3 weeks. Call directly.</div>
        <div className="mock-alert mock-alert-red">Storage unbilled 3 months - $3,200 in uncollected revenue.</div>
      </div>
    </div>
  );
}

/* ─── PROOF BAR ─── */
function ProofBar() {
  return (
    <>
      <hr className="section-break" />
      <section className="proof">
        <div className="wrap">
          <div className="proof-inner">
            <div className="proof-item">
              <div className="proof-num">$115K</div>
              <div className="proof-desc">collected on a $153K book<br />in the first 30 days</div>
            </div>
            <div className="proof-item">
              <div className="proof-num">$2K</div>
              <div className="proof-desc">monthly cost to<br />make that happen</div>
            </div>
            <div className="proof-item">
              <div className="proof-num">48hrs</div>
              <div className="proof-desc">from job completion<br />to invoice submitted</div>
            </div>
          </div>
        </div>
      </section>
      <hr className="section-break" />
    </>
  );
}

/* ─── FEATURES ─── */
function Features() {
  return (
    <>
      <hr className="section-break" />
      <section id="features">
        <div className="wrap">
          <div className="section-label">WHAT YOU GET</div>
          <h2>Everything included for $29/week</h2>
          <p style={{ maxWidth: 560 }}>Connect your QuickBooks. Get a dashboard, weekly briefings, real-time alerts, and monthly reviews. No setup fee. Cancel anytime.</p>

          <div className="features-grid">
            {/* DASHBOARD */}
            <div className="feature-card">
              <div className="feature-tag" style={{ color: "#0b7a4b" }}>ANYTIME - PHONE OR DESKTOP</div>
              <h3>Live Collections Dashboard</h3>
              <p>Every dollar you're owed. Who's paying, who's late, and who needs a call - in one screen.</p>
              <div className="feature-mock">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div><div style={{ fontSize: 7, fontWeight: 700, color: "#0b7a4b", letterSpacing: "0.06em" }}>FIELDGENERAL</div></div>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #0b7a4b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#0b7a4b" }}>62</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, marginBottom: 6 }}>
                  <div style={{ background: "#fff", borderRadius: 3, padding: "4px 6px" }}><div style={{ fontSize: 5, color: "#888", fontWeight: 600 }}>TOTAL OWED</div><div style={{ fontSize: 12, fontWeight: 700 }}>$132K</div></div>
                  <div style={{ background: "#fff", borderRadius: 3, padding: "4px 6px" }}><div style={{ fontSize: 5, color: "#888", fontWeight: 600 }}>COLLECTED</div><div style={{ fontSize: 12, fontWeight: 700, color: "#0b7a4b" }}>$46K</div></div>
                </div>
                <div style={{ display: "flex", gap: 1, height: 4, borderRadius: 2, overflow: "hidden" }}>
                  {[25,35,22,12,6].map((p,i) => <div key={i} style={{ flex: p, background: i < 2 ? "#0b7a4b" : i < 3 ? "#b8860b" : "#c44" }} />)}
                </div>
              </div>
            </div>

            {/* WEEKLY EMAIL */}
            <div className="feature-card">
              <div className="feature-tag" style={{ color: "#0b7a4b" }}>EVERY MONDAY - 7 AM</div>
              <h3>Weekly Collections Briefing</h3>
              <p>What came in, what's overdue, which accounts need follow-up, and the exact action to take on each one.</p>
              <div className="feature-mock">
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, paddingBottom: 4, borderBottom: "1px solid #eee" }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#0b7a4b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6, fontWeight: 700, color: "#fff" }}>F</div>
                  <div><div style={{ fontSize: 8, fontWeight: 700 }}>Collections Report - $132K outstanding</div><div style={{ fontSize: 6, color: "#aaa" }}>Monday 7:00 AM</div></div>
                </div>
                <div style={{ fontSize: 8, marginBottom: 4 }}><strong>Cash received:</strong> $6,488</div>
                <div style={{ fontSize: 8, padding: "3px 5px", background: "#fde8e8", borderRadius: 2, marginBottom: 2 }}>Bryant - $61K, 113 days. Escalate.</div>
                <div style={{ fontSize: 8, padding: "3px 5px", background: "#fdf3e0", borderRadius: 2, marginBottom: 2 }}>Mae - $36K, no response. Call directly.</div>
                <div style={{ fontSize: 8, padding: "3px 5px", background: "#fde8e8", borderRadius: 2 }}>Storage unbilled 3 months - $3.2K.</div>
              </div>
            </div>

            {/* TEXT ALERTS */}
            <div className="feature-card">
              <div className="feature-tag" style={{ color: "#b8860b" }}>INSTANT</div>
              <h3>Collection Alerts</h3>
              <p>Cash received, invoices going overdue, insurance reductions - the moment it happens, you know.</p>
              <div className="feature-mock" style={{ background: "#f2f2f7" }}>
                {[
                  { t: "Payment received: Duginski - $6,488 deposited.", time: "9:12 AM" },
                  { t: "Smith crossed 60 days overdue. $28,591 outstanding.", time: "2:15 PM" },
                  { t: "Carrier cut your $35,500 invoice to $13,700. Dispute flagged.", time: "10:30 AM" },
                ].map((m, i) => (
                  <div key={i} style={{ display: "flex", marginBottom: 4 }}>
                    <div style={{ padding: "5px 7px", background: "#e5e5ea", borderRadius: "8px 8px 8px 2px", fontSize: 8, color: "#000", lineHeight: 1.3, maxWidth: "90%" }}>
                      {m.t}
                      <div style={{ fontSize: 6, color: "#888", textAlign: "right", marginTop: 1 }}>{m.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MONTHLY REVIEW */}
            <div className="feature-card">
              <div className="feature-tag" style={{ color: "#000" }}>EVERY MONTH</div>
              <h3>Monthly Collections Review</h3>
              <p>How much you collected, how your aging changed, where you stand vs benchmarks, and what to focus on next.</p>
              <div className="feature-mock">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, marginBottom: 5 }}>
                  {[["Starting", "$153K"], ["Current", "$133K"], ["Collected", "$46K"], ["New Billed", "$32K"]].map(([l, v], i) => (
                    <div key={i} style={{ background: "#fff", borderRadius: 3, padding: "4px 6px" }}>
                      <div style={{ fontSize: 5, color: "#888", fontWeight: 600 }}>{l}</div>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 7, padding: "4px 6px", background: "#edf7f1", borderRadius: 2, lineHeight: 1.4 }}>
                  <strong>DSO improved.</strong> 55 to 47 days. Collected $46K. 40% of A/R past 30 days - industry avg is 45-60.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── PROBLEM ─── */
function Problem() {
  const items = [
    ["Invoices go out late - or never", "Every day between job completion and invoice submission is a day your cash sits in someone else's account."],
    ["Insurance cuts your invoice and you eat it", "Adjusters and third-party reviewers reduce line items because they can. Most contractors never push back."],
    ["Nobody's watching the aging", "Receivables slip past 30, 60, 90 days because there's no cadence, no follow-up, no system."],
    ["Billable work goes unbilled", "Equipment rentals, storage, additional labor, change orders - work that was completed and never invoiced."],
  ];
  return (
    <section id="problem">
      <div className="wrap">
        <div className="section-label">THE PROBLEM</div>
        <h2>So where's the money?</h2>
        <p>The job's done. The crew moved on. But the invoice hasn't gone out, the adjuster hasn't responded, and nobody's tracking what's owed.</p>
        <p>This is how six figures disappear - not in one big loss, but in dozens of small ones nobody notices.</p>
        <div className="problem-grid">
          {items.map(([title, desc], i) => (
            <div key={i} className="problem-item"><h3>{title}</h3><p>{desc}</p></div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── HOW IT WORKS ─── */
function HowItWorks() {
  const steps = [
    ["We connect to your books.", "Read-only access to your QuickBooks. On Command and Command & Control, we also get your adjuster email so we see what you see."],
    ["You see the truth.", "Every Monday you get a report: what you're owed, how long it's been sitting, which accounts need attention, and what to do about each one."],
    ["You choose your level.", "Intelligence - you act on better data. Command - we create invoices and draft your follow-ups. Command & Control - we handle everything: submissions, calls, disputes, collections. You run jobs, we chase the money."],
  ];
  return (
    <>
      <hr className="section-break" />
      <section id="how">
        <div className="wrap">
          <div className="section-label">HOW IT WORKS</div>
          <h2>Three steps</h2>
          <div className="flow">
            <div className="flow-grid">
              {steps.map(([title, desc], i) => (
                <div key={i} className="flow-step">
                  <div className="fn">{i + 1}</div>
                  <div className="ft"><strong>{title}</strong> {desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <hr className="section-break" />
    </>
  );
}

/* ─── CALCULATOR ─── */
function CalculatorSection() {
  const [step, setStep] = useState("input");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [vals, setVals] = useState({ jobs: 15, invoice: 8000, days: 55, cutFreq: 2 });

  const cutMap = [0, 0.1, 0.2, 0.35];
  const cutLabels = ["Always", "Usually", "Sometimes", "Rarely"];
  const cutRate = cutMap[vals.cutFreq];

  const annualRevenue = vals.jobs * 12 * vals.invoice;
  const extraDays = Math.max(0, vals.days - 30);
  const collectionDrag = (annualRevenue / 365) * extraDays;
  const recoverableCuts = annualRevenue * cutRate * 0.6;
  const adminHoursWeek = vals.jobs + 3;
  const annualAdminCost = adminHoursWeek * 52 * 35;
  const totalLeakage = collectionDrag + recoverableCuts + annualAdminCost;
  const estOutstanding = (vals.jobs * vals.invoice * vals.days) / 30;
  const monthlyAdminCost = adminHoursWeek * 35 * 4.3;

  const set = (k, v) => setVals({ ...vals, [k]: v });

  const handleEmailSubmit = async () => {
    if (!email.includes("@") || saving) return;
    setSaving(true);
    const payload = {
      email,
      jobs: vals.jobs,
      invoice: vals.invoice,
      days: vals.days,
      cutFreq: vals.cutFreq,
      annualRevenue,
      collectionDrag: Math.round(collectionDrag),
      recoverableCuts: Math.round(recoverableCuts),
      annualAdminCost: Math.round(annualAdminCost),
      totalLeakage: Math.round(totalLeakage),
    };
    // Write to Firestore
    try {
      await addDoc(collection(db, "fieldgeneral-leads"), { ...payload, createdAt: serverTimestamp() });
    } catch (err) { console.error("Firestore error:", err); }
    // Write to Google Sheet
    try {
      const params = encodeURIComponent(JSON.stringify(payload));
      const url = `${SHEET_WEBHOOK_URL}?data=${params}`;
      fetch(url, { mode: "no-cors", redirect: "follow" })
        .catch(() => {});
    } catch (err) { console.error("Sheet error:", err); }
    setSaving(false);
    setStep("results");
  };

  return (
    <section id="calculator" className="calculator-section">
      <div className="wrap">
        <div className="calc-card">
          {step === "input" && (
            <>
              <div className="section-label">CALCULATOR</div>
              <h2>How much are you leaving <em>on the table</em>?</h2>
              <p style={{ color: "#888", marginBottom: 24 }}>Four questions. Sixty seconds.</p>

              <InputGroup label="Invoices per month" value={vals.jobs} suffix="invoices">
                <input type="range" min={1} max={50} value={vals.jobs} onChange={e => set("jobs", +e.target.value)} />
                <Ticks labels={["1", "10", "20", "30", "40", "50"]} />
              </InputGroup>
              <InputGroup label="Average invoice size" value={fmt(vals.invoice)} suffix="">
                <input type="range" min={1000} max={50000} step={500} value={vals.invoice} onChange={e => set("invoice", +e.target.value)} />
                <Ticks labels={["$1K", "$10K", "$20K", "$30K", "$40K", "$50K"]} />
              </InputGroup>
              <InputGroup label="Average days to collect" value={vals.days} suffix="days">
                <input type="range" min={15} max={120} value={vals.days} onChange={e => set("days", +e.target.value)} />
                <div className="ticks-row">
                  <span>15</span><span style={{ color: "#0b7a4b", fontWeight: 700 }}>30 &larr; target</span><span>60</span><span>90</span><span>120</span>
                </div>
              </InputGroup>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>How often do you get paid the full invoice?</div>
                <div className="freq-grid">
                  {cutLabels.map((l, i) => (
                    <button key={i} onClick={() => set("cutFreq", i)} className={`freq-btn ${vals.cutFreq === i ? "active" : ""}`}>{l}</button>
                  ))}
                </div>
              </div>
              <button className="btn-primary" onClick={() => setStep("gate")}>Show me</button>
            </>
          )}

          {step === "gate" && (
            <div style={{ textAlign: "center" }}>
              <div className="section-label" style={{ marginBottom: 12 }}>YOUR ESTIMATED ANNUAL LEAKAGE</div>
              <div className="leakage-num">{fmt(totalLeakage)}</div>
              <p style={{ color: "#888", marginBottom: 28 }}>in uncollected receivables, unrecovered cuts, and admin overhead</p>
              <div className="gate-box">
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, textAlign: "left" }}>Enter your email to see the full breakdown:</div>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                  onKeyDown={e => e.key === "Enter" && handleEmailSubmit()}
                  className="email-input" />
                <button className="btn-primary" onClick={handleEmailSubmit} style={{ opacity: email.includes("@") ? 1 : 0.4 }}>
                  {saving ? "Saving..." : "See my full results"}
                </button>
                <p style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 8 }}>We'll send your results and a sample collections report.</p>
              </div>
              <div className="blur-preview">
                <div className="blur-inner">
                  {[["Receivables aging past target", collectionDrag], ["Insurance cuts you could dispute", recoverableCuts], ["Time spent chasing payments", annualAdminCost]].map(([l, v], i) => (
                    <div key={i} className="blur-row"><span>{l}</span><span style={{ fontWeight: 700 }}>{fmt(v)}</span></div>
                  ))}
                </div>
                <div className="blur-overlay">Enter email to unlock</div>
              </div>
            </div>
          )}

          {step === "results" && (
            <>
              <div className="section-label">YOUR RESULTS</div>
              <div className="results-hero">
                <div style={{ fontSize: 11, color: "#888", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 4 }}>ESTIMATED ANNUAL LEAKAGE</div>
                <div className="leakage-num">{fmt(totalLeakage)}</div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <ResultRow label="Receivables aging past target" value={fmt(collectionDrag)} color="#b8860b"
                  detail={`Your collections average ${vals.days} days. Every day past 30 is cash you've earned sitting in someone else's account - ${fmt(collectionDrag)} trapped at any given time.`} />
                <ResultRow label="Insurance cuts you could dispute" value={fmt(recoverableCuts)} color="#c44"
                  detail={`Carriers are reducing ~${Math.round(cutRate * 100)}% of your invoices. About 60% of those reductions are recoverable when you document the scope, methodology, and prior approvals.`} />
                <ResultRow label="Time spent chasing payments" value={fmt(annualAdminCost)} color="#0b7a4b"
                  detail={`${vals.jobs} hrs/week following up on receivables and tracking payment status. Plus 3 hrs pulling aging reports and reconciling. That's ${adminHoursWeek} hrs/week at $35/hr - ${fmt(monthlyAdminCost)}/month chasing your own money.`} />
              </div>

              <div className="callout">
                <div className="cl">THE COLLECTION TIME ARGUMENT</div>
                <p>
                  Someone on your team spends <strong>{adminHoursWeek} hours every week</strong> tracking receivables, following up on {vals.jobs} open invoices, and chasing payments - that's <strong>{fmt(monthlyAdminCost)}/month</strong> in labor.
                  FieldGeneral watches every receivable, flags every overdue account, and catches every insurance cut for <strong>$29/week</strong>.
                </p>
              </div>

              <button className="btn-secondary" onClick={() => { setStep("input"); setEmail(""); }}>
                Run again with different numbers
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── CASE STUDY RESULTS ─── */
function Results() {
  return (
    <>
      <hr className="section-break" />
      <section id="results">
        <div className="wrap">
          <div className="section-label">RESULTS</div>
          <h2>What 30 days looks like</h2>
          <p>One contractor. One specialist. No software implementation. Just a person on a system, watching the money.</p>
          <div className="case-grid">
            {[
              ["Starting A/R", "$153K", "outstanding across 14 invoices"],
              ["Cash moved", "$115K", "collected, settled, or closing"],
              ["Stuck account", "$69K", "stalled for months - settled in full"],
              ["Disputed cut", "$29.5K", "carrier cut 61% - recovered"],
            ].map(([label, value, sub], i) => (
              <div key={i} className="case-card">
                <div className="case-card-label">{label}</div>
                <div className="case-card-value">{value}</div>
                <div className="case-card-sub">{sub}</div>
              </div>
            ))}
          </div>
          <div className="callout">
            <div className="cl">THE DISPUTE</div>
            <p>A carrier reviewed a $35,500 invoice and approved $13,700 - a <strong>61% reduction.</strong></p>
            <p>We built the dispute around the documentation, the methodology, and the adjuster's own prior approval.</p>
            <p><strong>Collected $29,500.</strong> That one dispute paid for over a year of service.</p>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── PRICING ─── */
function Pricing() {
  return (
    <>
      <hr className="section-break" />
      <section id="pricing">
        <div className="wrap">
          <div className="section-label">PRICING</div>
          <h2>Simple pricing. Each tier sells the next.</h2>
          <div className="tiers-3">
            <div className="tier">
              <div className="tier-label">INTELLIGENCE</div>
              <div className="tier-name">See Where Your Money Is</div>
              <div className="tier-price">$29<span>/week</span></div>
              <div className="tier-note">$129/month. No setup fee. Cancel anytime.</div>
              <ul className="tier-list">
                <li>Live collections dashboard</li>
                <li>Weekly A/R intelligence report</li>
                <li>Aging breakdown with threshold alerts</li>
                <li>Unbilled work detection</li>
                <li>Adjuster cut flagging</li>
                <li>Text and email alerts</li>
                <li>Monthly collections review</li>
              </ul>
              <a href="#calculator" className="tier-btn tier-btn-light">Start with your numbers</a>
            </div>
            <div className="tier">
              <div className="tier-label">COMMAND</div>
              <div className="tier-name">Know Exactly What To Do</div>
              <div className="tier-price">$1,500<span>/mo</span></div>
              <div className="tier-note">Based on volume. $1,000 one-time setup.</div>
              <ul className="tier-list">
                <li>Everything in Intelligence</li>
                <li>Invoices created in your QBO</li>
                <li>Action items with drafts attached</li>
                <li>Adjuster cut analysis + dispute drafts</li>
                <li>Payment reconciliation</li>
                <li>Weekly briefing: what we did, your to-do</li>
                <li>Dedicated specialist on your account</li>
              </ul>
              <a href="mailto:matt@fieldgeneral.ai" className="tier-btn tier-btn-dark">Let's talk</a>
            </div>
            <div className="tier tier-pop">
              <div className="tier-badge">FULL SERVICE</div>
              <div className="tier-label">COMMAND &amp; CONTROL</div>
              <div className="tier-name">We Handle It. You Run Jobs.</div>
              <div className="tier-price">$2,000<span>/mo</span></div>
              <div className="tier-note">Based on volume. $1,000 one-time setup.</div>
              <ul className="tier-list">
                <li>Everything in Command</li>
                <li>Invoices submitted to carriers within 48hrs</li>
                <li>Full collections cadence - all 5 touches</li>
                <li>Adjuster calls and follow-up</li>
                <li>Disputes filed and managed</li>
                <li>Carrier submissions handled</li>
                <li>Timestamped activity log of every action</li>
                <li>Monthly intelligence report with insights</li>
              </ul>
              <a href="mailto:matt@fieldgeneral.ai" className="tier-btn tier-btn-dark">Let's talk</a>
            </div>
          </div>
          <div className="vol">
            <div className="vol-head">COMMAND &amp; CONTROL VOLUME PRICING</div>
            {[["1-15 invoices/month", "$2,000/mo"], ["16-30 invoices/month", "$2,500/mo"], ["31-50 invoices/month", "$3,500/mo"], ["50+ invoices/month", "Let's talk"]].map(([range, price], i) => (
              <div key={i} className="vol-row"><span>{range}</span><span>{price}</span></div>
            ))}
          </div>
          <p style={{ textAlign: "center", fontSize: 12, color: "#888", marginTop: 12 }}>Intelligence clients who upgrade get the setup fee waived.</p>
        </div>
      </section>
    </>
  );
}

/* ─── FAQ ─── */
function FAQ() {
  const items = [
    ["What do you need from me to get started?", "Intelligence: read-only access to your QuickBooks Online. That's it. Command and Command & Control add read access to your adjuster email so we see what you see. One onboarding call covers everything."],
    ["Do I have to change how I work?", "No. Treat us like your billing person. When a job phase is done, tell us however you'd normally tell someone - text, email, call. We handle it from there."],
    ["Who sends the invoices?", "On Command, we create invoices in your QuickBooks and hand them off for you to submit. On Command & Control, we create and submit them to carriers using your company's identity. The adjuster sees your company name, not ours."],
    ["Do you only work with contents restoration?", "No. We work with mitigation, reconstruction, and contents contractors. If you invoice insurance carriers or GCs, we can help."],
    ["How is this different from a bookkeeper?", "A bookkeeper records what happened. We make things happen. We don't just track your receivables - we chase them. We know which line items get cut, which carriers are slow, and when a reduction is worth fighting."],
    ["What does this cost compared to hiring someone?", "A billing person at $24/hr costs $4,500-5,000/month with taxes and benefits. They need training, call in sick, and can only work on your accounts. Command & Control starts at $2,000/month with the systems and follow-through built in."],
    ["Can I start small and upgrade later?", "Yes. Most clients do. Start at $29/week with Intelligence and see your real numbers. When you want us to take action, move to Command or Command & Control - we waive the setup fee."],
  ];
  return (
    <>
      <hr className="section-break" />
      <section id="faq">
        <div className="wrap">
          <div className="section-label">FAQ</div>
          <h2>Questions we hear</h2>
          <div className="faq-grid">
            {items.map(([q, a], i) => (
              <div key={i} className="faq-item">
                <div className="faq-q">{q}</div>
                <div className="faq-a">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── BOTTOM CTA ─── */
function BottomCTA() {
  return (
    <>
      <hr className="section-break" />
      <section className="bottom-cta">
        <div className="wrap">
          <h2>See what you're leaving "on the table"</h2>
          <p>Four numbers. Sixty seconds. Find out what your business is actually losing.</p>
          <a href="#calculator" className="hero-cta">Run the calculator</a>
        </div>
      </section>
    </>
  );
}

/* ─── FOOTER ─── */
function Footer() {
  return (
    <footer>
      FieldGeneral.ai &middot; Collections intelligence for specialty contractors<br />
      &copy; 2026 FieldGeneral. All rights reserved.
    </footer>
  );
}

/* ─── SMALL COMPONENTS ─── */
function InputGroup({ label, value, suffix, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{value} <span style={{ fontSize: 12, fontWeight: 400, color: "#888" }}>{suffix}</span></span>
      </div>
      {children}
    </div>
  );
}
function Ticks({ labels }) {
  return <div className="ticks-row">{labels.map((l, i) => <span key={i}>{l}</span>)}</div>;
}
function ResultRow({ label, value, detail, color }) {
  return (
    <div className="result-row">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span>
      </div>
      <p style={{ fontSize: 12, color: "#888", lineHeight: 1.5, margin: 0, textAlign: "justify" }}>{detail}</p>
    </div>
  );
}
