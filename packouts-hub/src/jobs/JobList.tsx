import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, MapPin, Calendar, Loader2 } from 'lucide-react';
import { getMcpClient } from './McpClient';
import StatusBadge from './components/StatusBadge';
import type { XcelerateJob, StatusFilter } from './types';

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Storage', value: 'storage' },
  { label: 'Closed', value: 'closed' },
];

const ACTIVE_STATUSES = new Set(['new', 'planning', 'packout', 'packback', 'sales', 'on hold']);
const STORAGE_STATUSES = new Set(['storage']);
const CLOSED_STATUSES = new Set(['final invoice', 'receivables', 'paid in full']);

function matchesFilter(job: XcelerateJob, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  const s = job.status?.toLowerCase() || '';
  if (filter === 'active') return ACTIVE_STATUSES.has(s);
  if (filter === 'storage') return STORAGE_STATUSES.has(s);
  if (filter === 'closed') return CLOSED_STATUSES.has(s);
  return true;
}

export default function JobList() {
  const [jobs, setJobs] = useState<XcelerateJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    const client = getMcpClient('xcelerate');
    client.callTool<XcelerateJob[]>('list_jobs', { limit: 100 })
      .then((jobs) => jobs.filter((j) => j.status !== '_DELETED_TEST_'))
      .then(setJobs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = jobs.filter((job) => {
    if (!matchesFilter(job, filter)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        job.customer_name?.toLowerCase().includes(q) ||
        job.property_address?.toLowerCase().includes(q) ||
        job.property_city?.toLowerCase().includes(q) ||
        job.job_number?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-warm">
      {/* Header */}
      <header className="bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Hub
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
          <p className="text-sm text-white/60 mt-1">Active and recent jobs from Xcelerate</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by customer, address, or job #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-navy/40 focus:ring-1 focus:ring-navy/20"
            />
          </div>
          <div className="flex gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === f.value
                    ? 'bg-navy text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-navy/30'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* States */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-navy animate-spin" />
            <span className="ml-3 text-gray-500">Loading jobs...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
            Failed to load jobs: {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="text-gray-400 text-center py-16">No jobs match your search.</p>
        )}

        {/* Job Cards */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="group bg-white rounded-2xl border border-gray-200 p-5 hover:border-navy/30 hover:shadow-lg transition-all block"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-base font-bold text-gray-800 group-hover:text-navy transition-colors">
                    {job.customer_name}
                  </h3>
                  <StatusBadge status={job.status} />
                </div>

                {job.property_address && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{job.property_address}{job.property_city ? `, ${job.property_city}` : ''}</span>
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
                  {job.job_number && (
                    <span className="font-mono">{job.job_number}</span>
                  )}
                  {job.loss_type && <span>{job.loss_type}</span>}
                  {job.date_received && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(job.date_received).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
