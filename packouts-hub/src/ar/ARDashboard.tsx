import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, DollarSign, Loader2, Search, ChevronDown, ChevronUp, AlertTriangle, ExternalLink, CheckCircle } from 'lucide-react';
import { getMcpClient } from '../jobs/McpClient';
import type { AgingData, AgingInvoice, XcelerateJob, CollectionsData } from '../jobs/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount?: number): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPct(value: number, total: number): string {
  if (total === 0) return '0%';
  return Math.round((value / total) * 100) + '%';
}

// ---------------------------------------------------------------------------
// Action rules — ported from cloud-fn-ar-review/action-rules.js
// ---------------------------------------------------------------------------

const BUCKET_ORDER = ['Current', '1-30', '31-60', '61-90', '90+'] as const;

function getAction(bucket: string, balance: number): string {
  const highPriority = balance >= 10000;
  let action: string;

  switch (bucket) {
    case 'Current':
      action = 'No action needed';
      break;
    case '1-30':
      action = 'Send payment reminder';
      break;
    case '31-60':
      action = 'Phone follow-up + adjuster escalation';
      break;
    case '61-90':
      action = 'Formal demand letter + carrier escalation';
      break;
    case '90+':
      action = balance < 500 ? 'Collections review — consider write-off' : 'Collections review — attorney letter';
      break;
    default:
      action = 'Review manually';
  }

  return highPriority ? `HIGH PRIORITY: ${action}` : action;
}

function bucketIndex(bucket: string): number {
  const idx = BUCKET_ORDER.indexOf(bucket as typeof BUCKET_ORDER[number]);
  return idx === -1 ? 0 : idx;
}

// ---------------------------------------------------------------------------
// Bucket colors
// ---------------------------------------------------------------------------

const BUCKET_STYLES: Record<string, { bg: string; border: string; text: string; borderLeft: string; badge: string }> = {
  'Current': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', borderLeft: 'border-l-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  '1-30':    { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   borderLeft: 'border-l-amber-500',   badge: 'bg-amber-50 text-amber-700' },
  '31-60':   { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',  borderLeft: 'border-l-orange-500',  badge: 'bg-orange-50 text-orange-700' },
  '61-90':   { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     borderLeft: 'border-l-red-500',     badge: 'bg-red-50 text-red-700' },
  '90+':     { bg: 'bg-red-100',    border: 'border-red-300',     text: 'text-red-900',     borderLeft: 'border-l-red-800',     badge: 'bg-red-100 text-red-900' },
};

function getBucketStyle(bucket: string) {
  return BUCKET_STYLES[bucket] || BUCKET_STYLES['Current'];
}

// ---------------------------------------------------------------------------
// Customer group type
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Name matching — QBO names ("Hart, Frank") ↔ Xcelerate ("Frank Hart")
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function namesMatch(qboName: string, jobName: string): boolean {
  const a = normalizeName(qboName);
  const b = normalizeName(jobName);
  if (a === b) return true;
  // QBO: "Hart, Frank" → split and check both orderings
  const qboParts = qboName.split(/[,\s]+/).map(normalizeName).filter(Boolean);
  const jobParts = jobName.split(/[,\s]+/).map(normalizeName).filter(Boolean);
  if (qboParts.length >= 2 && jobParts.length >= 2) {
    // Check if last names match
    const qboLast = qboParts[0]; // QBO is typically "Last, First"
    const jobLast = jobParts[jobParts.length - 1]; // Xcelerate is typically "First Last"
    if (qboLast === jobLast) return true;
    // Also try: both could be "Last, First" format
    if (qboParts[0] === jobParts[0]) return true;
  }
  return false;
}

function buildJobMap(jobs: XcelerateJob[]): Map<string, string> {
  // Map normalized customer names → job ID
  const map = new Map<string, string>();
  for (const job of jobs) {
    if (job.customer_name && job.id) {
      map.set(normalizeName(job.customer_name), job.id);
    }
  }
  return map;
}

function findJobId(customerName: string, jobs: XcelerateJob[], jobMap: Map<string, string>): string | null {
  // Direct normalized match
  const direct = jobMap.get(normalizeName(customerName));
  if (direct) return direct;
  // Fuzzy match
  for (const job of jobs) {
    if (job.customer_name && namesMatch(customerName, job.customer_name)) {
      return job.id;
    }
  }
  return null;
}

interface CustomerGroup {
  name: string;
  invoices: AgingInvoice[];
  totalBalance: number;
  worstBucket: string;
  oldestDays: number;
  action: string;
  jobId: string | null;
}

type SortKey = 'amount' | 'age' | 'name';
type BucketFilter = 'all' | 'Current' | '1-30' | '31-60' | '61-90' | '90+';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ARDashboard() {
  const [data, setData] = useState<AgingData | null>(null);
  const [collections, setCollections] = useState<CollectionsData | null>(null);
  const [jobs, setJobs] = useState<XcelerateJob[]>([]);
  const [jobMap, setJobMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('amount');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Fetch aging data + collections + jobs in parallel
  useEffect(() => {
    Promise.all([
      getMcpClient('qbo').callTool<AgingData>('get_ar_aging', {}),
      getMcpClient('qbo').callTool<CollectionsData>('get_collections', {}).catch(() => null),
      getMcpClient('xcelerate').callTool<XcelerateJob[]>('list_jobs', { limit: 100 }).catch(() => [] as XcelerateJob[]),
    ])
      .then(([aging, coll, jobList]) => {
        setData(aging);
        setCollections(coll);
        const jl = Array.isArray(jobList) ? jobList : [];
        setJobs(jl);
        setJobMap(buildJobMap(jl));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Build customer groups
  const customers = useMemo(() => {
    if (!data) return [];

    // Flatten all invoices
    let allInvoices: AgingInvoice[] = [];
    for (const bucket of BUCKET_ORDER) {
      const items = data.buckets[bucket] || [];
      allInvoices = allInvoices.concat(items);
    }

    // Filter by bucket
    if (bucketFilter !== 'all') {
      allInvoices = allInvoices.filter((inv) => inv.bucket === bucketFilter);
    }

    // Group by customer
    const map = new Map<string, AgingInvoice[]>();
    for (const inv of allInvoices) {
      const key = inv.customer || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    }

    // Build groups
    const groups: CustomerGroup[] = [];
    for (const [name, invoices] of map) {
      const totalBalance = invoices.reduce((s, i) => s + i.balance, 0);
      const worst = invoices.reduce((w, i) => (bucketIndex(i.bucket) > bucketIndex(w.bucket) ? i : w), invoices[0]);
      const oldestDays = Math.max(...invoices.map((i) => i.days_outstanding));
      groups.push({
        name,
        invoices: invoices.sort((a, b) => b.days_outstanding - a.days_outstanding),
        totalBalance,
        worstBucket: worst.bucket,
        oldestDays,
        action: getAction(worst.bucket, totalBalance),
        jobId: findJobId(name, jobs, jobMap),
      });
    }

    // Filter by search
    const filtered = search
      ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
      : groups;

    // Sort
    switch (sort) {
      case 'amount':
        filtered.sort((a, b) => b.totalBalance - a.totalBalance);
        break;
      case 'age':
        filtered.sort((a, b) => b.oldestDays - a.oldestDays);
        break;
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return filtered;
  }, [data, bucketFilter, search, sort, jobs, jobMap]);

  // High priority customers ($10K+)
  const highPriorityCount = useMemo(() => {
    if (!data) return 0;
    const allInvoices: AgingInvoice[] = Object.values(data.buckets).flat();
    const byCustomer = new Map<string, number>();
    for (const inv of allInvoices) {
      byCustomer.set(inv.customer, (byCustomer.get(inv.customer) || 0) + inv.balance);
    }
    return [...byCustomer.values()].filter((b) => b >= 10000).length;
  }, [data]);

  const toggleExpanded = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const over60 = data
    ? (data.summary['61-90']?.total || 0) + (data.summary['90+']?.total || 0)
    : 0;

  return (
    <div className="min-h-screen bg-warm">
      {/* Header */}
      <header className="bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <Link to="/" className="inline-flex items-center gap-1 text-white/60 hover:text-white text-sm mb-3 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Hub
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Accounts Receivable</h1>
              {data && (
                <p className="text-sm text-white/60">as of {formatDate(data.as_of)}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-navy animate-spin" />
            <span className="ml-3 text-gray-500">Loading A/R data from QuickBooks...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
            Failed to load A/R data: {error}
          </div>
        )}

        {data && !loading && !error && (
          <>
            {/* KPI Summary */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Total Outstanding</p>
                  <p className="text-2xl font-black text-navy">{formatCurrency(data.summary.grand_total?.total)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Open Invoices</p>
                  <p className="text-2xl font-black text-gray-700">{data.summary.grand_total?.count || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Over 60 Days</p>
                  <p className={`text-2xl font-black ${over60 > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatCurrency(over60)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">High Priority</p>
                  <div className="flex items-center gap-2">
                    <p className={`text-2xl font-black ${highPriorityCount > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                      {highPriorityCount}
                    </p>
                    {highPriorityCount > 0 && (
                      <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                        $10K+
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Collections */}
            {collections && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-4">Collections</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Last 7 Days</p>
                    <p className="text-2xl font-black text-emerald-600">{formatCurrency(collections.last_7_days)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Last 30 Days</p>
                    <p className="text-2xl font-black text-emerald-600">{formatCurrency(collections.last_30_days)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Last Month</p>
                    <p className="text-2xl font-black text-navy">{formatCurrency(collections.last_month.total)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{collections.last_month.period}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">YTD</p>
                    <p className="text-2xl font-black text-navy">{formatCurrency(collections.ytd)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{new Date().getFullYear()}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Scorecard */}
            {(() => {
              const grandTotal = data.summary.grand_total?.total || 0;
              const currentTotal = data.summary['Current']?.total || 0;
              const bucket130Total = data.summary['1-30']?.total || 0;
              const bucket90PlusTotal = data.summary['90+']?.total || 0;

              const arUnder30Pct = grandTotal > 0 ? ((currentTotal + bucket130Total) / grandTotal) * 100 : 0;
              const arOver90Pct = grandTotal > 0 ? (bucket90PlusTotal / grandTotal) * 100 : 0;

              const arUnder30Target = 90;
              const arOver90Target = 0;
              const arUnder30Hit = arUnder30Pct >= arUnder30Target;
              const arOver90Hit = arOver90Pct <= arOver90Target;
              const arUnder30Delta = arUnder30Pct - arUnder30Target;
              const arOver90Delta = arOver90Pct - arOver90Target;

              return (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-4">Scorecard</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {/* A/R Under 30 Days */}
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">A/R Under 30 Days</p>
                      <div className="flex items-baseline gap-2">
                        <p className={`text-2xl font-black ${arUnder30Hit ? 'text-emerald-600' : 'text-red-600'}`}>
                          {arUnder30Pct.toFixed(1)}%
                        </p>
                        {arUnder30Hit ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            MISS
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Target: {arUnder30Target}% &middot;{' '}
                        <span className={arUnder30Delta >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                          {arUnder30Delta >= 0 ? '+' : ''}{arUnder30Delta.toFixed(1)} pts
                        </span>
                      </p>
                    </div>

                    {/* A/R Over 90 Days */}
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">A/R Over 90 Days</p>
                      <div className="flex items-baseline gap-2">
                        <p className={`text-2xl font-black ${arOver90Hit ? 'text-emerald-600' : 'text-red-600'}`}>
                          {arOver90Pct.toFixed(1)}%
                        </p>
                        {arOver90Hit ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            MISS
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Target: {arOver90Target}% &middot;{' '}
                        <span className={arOver90Delta <= 0 ? 'text-emerald-600' : 'text-red-600'}>
                          {arOver90Delta > 0 ? '+' : ''}{arOver90Delta.toFixed(1)} pts
                        </span>
                      </p>
                    </div>

                    {/* Collection Velocity */}
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Collection Velocity</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-black text-navy">
                          {formatCurrency(currentTotal)}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Current bucket &middot;{' '}
                        <span className="text-navy">
                          {grandTotal > 0 ? ((currentTotal / grandTotal) * 100).toFixed(1) : '0.0'}% of total
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Aging Bucket Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {BUCKET_ORDER.map((bucket) => {
                const s = data.summary[bucket] || { count: 0, total: 0 };
                const style = getBucketStyle(bucket);
                const isActive = bucketFilter === bucket;
                return (
                  <button
                    key={bucket}
                    onClick={() => setBucketFilter(isActive ? 'all' : bucket as BucketFilter)}
                    className={`rounded-xl border p-4 text-left transition-all ${style.bg} ${style.border} ${
                      isActive ? 'ring-2 ring-navy shadow-md' : 'hover:shadow-sm'
                    }`}
                  >
                    <p className={`text-lg font-black ${style.text}`}>{formatCurrency(s.total)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {s.count} invoice{s.count !== 1 ? 's' : ''} · {formatPct(s.total, data.summary.grand_total?.total || 1)}
                    </p>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${style.text}`}>{bucket === 'Current' ? 'Current' : bucket + ' days'}</p>
                  </button>
                );
              })}
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-navy/40 focus:ring-1 focus:ring-navy/20"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="text-sm rounded-lg border border-gray-200 px-3 py-2 bg-white text-gray-700 cursor-pointer"
                >
                  <option value="amount">Amount (high→low)</option>
                  <option value="age">Age (oldest first)</option>
                  <option value="name">Customer (A→Z)</option>
                </select>
                {bucketFilter !== 'all' && (
                  <button
                    onClick={() => setBucketFilter('all')}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-navy text-white hover:bg-navy-light transition-colors"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            </div>

            {/* Customer Groups */}
            {customers.length === 0 ? (
              <p className="text-gray-400 text-center py-16">No invoices matching filter.</p>
            ) : (
              <div className="space-y-3">
                {customers.map((cust) => {
                  const style = getBucketStyle(cust.worstBucket);
                  const isExpanded = expanded.has(cust.name);
                  const isHighPriority = cust.totalBalance >= 10000;

                  return (
                    <div
                      key={cust.name}
                      className={`bg-white rounded-2xl border border-gray-200 overflow-hidden border-l-4 ${style.borderLeft}`}
                    >
                      {/* Customer header — clickable */}
                      <button
                        onClick={() => toggleExpanded(cust.name)}
                        className="w-full text-left p-5 hover:bg-gray-50/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base font-bold text-gray-800">{cust.name}</h3>
                              {cust.jobId && (
                                <Link
                                  to={`/jobs/${cust.jobId}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-navy/60 hover:text-navy bg-sky-50 hover:bg-sky-100 px-2 py-0.5 rounded-full transition-colors"
                                  title="View job file"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  Job
                                </Link>
                              )}
                              {isHighPriority && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  HIGH PRIORITY
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {cust.invoices.length} invoice{cust.invoices.length !== 1 ? 's' : ''} · Oldest: {cust.oldestDays} days
                            </p>
                            <p className={`text-xs font-medium mt-1.5 ${style.text}`}>
                              {cust.action}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <p className="text-lg font-black text-gray-800">{formatCurrency(cust.totalBalance)}</p>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expanded invoice detail */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-5 pb-4">
                          <table className="w-full text-sm mt-3">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-2 px-2 font-semibold text-gray-500 text-xs">Invoice #</th>
                                <th className="text-left py-2 px-2 font-semibold text-gray-500 text-xs">Date</th>
                                <th className="text-left py-2 px-2 font-semibold text-gray-500 text-xs">Due</th>
                                <th className="text-right py-2 px-2 font-semibold text-gray-500 text-xs">Balance</th>
                                <th className="text-right py-2 px-2 font-semibold text-gray-500 text-xs">Days</th>
                                <th className="text-left py-2 px-2 font-semibold text-gray-500 text-xs">Bucket</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cust.invoices.map((inv) => {
                                const invStyle = getBucketStyle(inv.bucket);
                                return (
                                  <tr key={inv.invoice_num} className="border-b border-gray-50 hover:bg-gray-50">
                                    <td className="py-2 px-2 font-mono text-xs">{inv.invoice_num}</td>
                                    <td className="py-2 px-2 text-xs text-gray-600">{formatDate(inv.invoice_date)}</td>
                                    <td className="py-2 px-2 text-xs text-gray-600">{formatDate(inv.due_date)}</td>
                                    <td className="py-2 px-2 text-right font-mono text-xs font-semibold">{formatCurrency(inv.balance)}</td>
                                    <td className="py-2 px-2 text-right text-xs text-gray-600">{inv.days_outstanding}</td>
                                    <td className="py-2 px-2">
                                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${invStyle.badge}`}>
                                        {inv.bucket}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
