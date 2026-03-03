import { useState, useEffect } from 'react';
import { ArrowLeft, ExternalLink, BarChart3, Search, Globe, Loader2, Eye, Users, MousePointerClick } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getMcpClient } from './jobs/McpClient';
import type { WebsiteAnalytics } from './jobs/types';

// ---------------------------------------------------------------------------
// Site config
// ---------------------------------------------------------------------------

const sites = [
  {
    name: 'AZ Fire Help',
    domain: 'azfirehelp.com',
    url: 'https://azfirehelp.com',
    gaId: 'G-2F8K16X9MZ',
    gaPropertyId: '526332879',
    description: 'Fire damage recovery guide for Arizona homeowners',
    pages: 11,
    color: 'bg-orange-500',
    barColor: 'bg-orange-400',
  },
  {
    name: 'AZ Flood Help',
    domain: 'azfloodhelp.com',
    url: 'https://azfloodhelp.com',
    gaId: 'G-FZT42K9TFN',
    gaPropertyId: '526346286',
    description: 'Water damage help — pipe bursts, supply line failures, water heater leaks',
    pages: 9,
    color: 'bg-blue-500',
    barColor: 'bg-blue-400',
  },
  {
    name: 'Packouts AZ',
    domain: 'packoutsaz.com',
    url: 'https://packoutsaz.com',
    gaId: 'G-6TRTB186BQ',
    gaPropertyId: '526347012',
    description: 'Contents restoration — pack-out, cleaning, storage, pack-back',
    pages: 9,
    color: 'bg-teal-500',
    barColor: 'bg-teal-400',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function formatDateShort(dateStr: string): string {
  // "2026-02-24" → "Feb 24"
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Sparkline — 7-day bar chart
// ---------------------------------------------------------------------------

function Sparkline({ data, barColor }: { data: { date: string; pageviews: number }[]; barColor: string }) {
  const max = Math.max(...data.map((d) => d.pageviews), 1);
  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((d) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
          <div
            className={`${barColor} rounded-sm w-full min-w-[6px] transition-all`}
            style={{ height: `${Math.max((d.pageviews / max) * 100, 4)}%` }}
            title={`${formatDateShort(d.date)}: ${d.pageviews} views`}
          />
          <span className="text-[8px] text-gray-300 leading-none">{formatDateShort(d.date).split(' ')[1]}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Stat
// ---------------------------------------------------------------------------

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="text-xl font-black text-navy">{formatNumber(value)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Site Card
// ---------------------------------------------------------------------------

interface SiteConfig {
  name: string;
  domain: string;
  url: string;
  gaId: string;
  gaPropertyId: string;
  description: string;
  pages: number;
  color: string;
  barColor: string;
}

function SiteCard({
  site,
  analytics,
  error,
  loading,
}: {
  site: SiteConfig;
  analytics: WebsiteAnalytics | null;
  error: string | null;
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${site.color} flex items-center justify-center`}>
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">{site.name}</h2>
            <p className="text-sm text-gray-500">{site.description}</p>
          </div>
        </div>
        <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded">
          {site.pages} pages
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-navy animate-spin" />
          <span className="ml-2 text-sm text-gray-400">Loading analytics...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 mb-4">
          {error}
        </div>
      )}

      {/* Analytics data */}
      {analytics && !loading && (
        <>
          {/* KPI Row — 7-day */}
          <div className="mb-4">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Last 7 Days</p>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Users" value={analytics.last_7_days.users} icon={Users} />
              <Stat label="Sessions" value={analytics.last_7_days.sessions} icon={MousePointerClick} />
              <Stat label="Views" value={analytics.last_7_days.pageviews} icon={Eye} />
            </div>
          </div>

          {/* Sparkline */}
          {analytics.daily_trend.length > 0 && (
            <div className="mb-4 px-2">
              <Sparkline data={analytics.daily_trend} barColor={site.barColor} />
            </div>
          )}

          {/* 28-day summary */}
          <div className="mb-4 bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">Last 28 Days</p>
            <p className="text-sm text-gray-600">
              <span className="font-bold text-gray-800">{formatNumber(analytics.last_28_days.users)}</span> users
              {' \u00b7 '}
              <span className="font-bold text-gray-800">{formatNumber(analytics.last_28_days.sessions)}</span> sessions
              {' \u00b7 '}
              <span className="font-bold text-gray-800">{formatNumber(analytics.last_28_days.pageviews)}</span> views
            </p>
          </div>

          {/* Top Pages */}
          {analytics.top_pages.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Top Pages (28d)</p>
              <div className="space-y-1.5">
                {analytics.top_pages.map((page) => {
                  const maxViews = analytics.top_pages[0]?.views || 1;
                  return (
                    <div key={page.path} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-mono text-gray-700 truncate">{page.path}</span>
                          <span className="text-xs font-bold text-gray-500 ml-2 shrink-0">{page.views}</span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${site.barColor} rounded-full`}
                            style={{ width: `${(page.views / maxViews) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* No data state */}
      {!analytics && !loading && !error && (
        <p className="text-gray-400 text-center py-8 text-sm">No analytics data yet.</p>
      )}

      {/* Action links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
        <a
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 hover:border-navy/30 hover:bg-gray-50 transition-all group"
        >
          <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-navy" />
          <div>
            <div className="text-sm font-semibold text-gray-700 group-hover:text-navy">{site.domain}</div>
            <div className="text-xs text-gray-400">Visit site</div>
          </div>
        </a>
        <a
          href={`https://analytics.google.com/analytics/web/#/p${site.gaPropertyId}/reports/reportinghub`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 hover:border-navy/30 hover:bg-gray-50 transition-all group"
        >
          <BarChart3 className="w-4 h-4 text-gray-400 group-hover:text-navy" />
          <div>
            <div className="text-sm font-semibold text-gray-700 group-hover:text-navy">Analytics</div>
            <div className="text-xs text-gray-400">{site.gaId}</div>
          </div>
        </a>
        <a
          href={`https://search.google.com/search-console?resource_id=sc-domain%3A${site.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 hover:border-navy/30 hover:bg-gray-50 transition-all group"
        >
          <Search className="w-4 h-4 text-gray-400 group-hover:text-navy" />
          <div>
            <div className="text-sm font-semibold text-gray-700 group-hover:text-navy">Search Console</div>
            <div className="text-xs text-gray-400">Indexing & performance</div>
          </div>
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Websites() {
  const [analytics, setAnalytics] = useState<Record<string, WebsiteAnalytics>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled(
      sites.map((site) =>
        getMcpClient('xcelerate')
          .callTool<WebsiteAnalytics>('get_website_analytics', { property_id: site.gaPropertyId })
          .then((data) => ({ domain: site.domain, data }))
      )
    ).then((results) => {
      const analyticsMap: Record<string, WebsiteAnalytics> = {};
      const errorMap: Record<string, string> = {};
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          analyticsMap[sites[i].domain] = result.value.data;
        } else {
          errorMap[sites[i].domain] = result.reason?.message || 'Failed to load analytics';
        }
      });
      setAnalytics(analyticsMap);
      setErrors(errorMap);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-warm">
      <header className="bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <Link to="/" className="inline-flex items-center gap-1 text-white/60 hover:text-white text-sm mb-3 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Hub
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-500 flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Websites</h1>
              <p className="text-sm text-white/60">Marketing sites, analytics & search performance</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid gap-6">
          {sites.map((site) => (
            <SiteCard
              key={site.domain}
              site={site}
              analytics={analytics[site.domain] || null}
              error={errors[site.domain] || null}
              loading={loading}
            />
          ))}
        </div>

        {/* Quick Links */}
        <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Quick Links</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="https://console.firebase.google.com/project/packouts-assistant-1800/hosting"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-navy transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Firebase Hosting Console
            </a>
            <a
              href="https://business.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-navy transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Google Business Profile
            </a>
            <a
              href="https://app.callrail.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-navy transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              CallRail Dashboard
            </a>
            <a
              href="https://www.namecheap.com/myaccount/login/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-navy transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Namecheap (Domains)
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
