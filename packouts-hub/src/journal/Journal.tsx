import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, User, Bot } from 'lucide-react';
import { marked } from 'marked';
import { getMcpClient } from '../jobs/McpClient';
import type { JournalEntry } from '../jobs/types';

function renderMarkdown(md: string): string {
  marked.setOptions({ gfm: true, breaks: false });
  const result = marked.parse(md);
  return typeof result === 'string' ? result : '';
}

function formatDateHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function Journal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const loadEntries = useCallback(async (tag?: string | null) => {
    setLoading(true);
    try {
      const args: Record<string, unknown> = { limit: 100 };
      if (tag) args.tag = tag;
      const result = await getMcpClient('xcelerate').callTool<JournalEntry[]>('list_journal', args);
      setEntries(result || []);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadEntries(activeTag);
  }, [loadEntries, activeTag]);

  // Extract unique tags from loaded entries
  const allTags = Array.from(new Set(entries.flatMap((e) => e.tags))).sort();

  // Group entries by date
  const grouped = entries.reduce<Record<string, JournalEntry[]>>((acc, entry) => {
    const key = entry.date || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen bg-warm">
      {/* Header */}
      <header className="bg-navy text-white sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors text-sm shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Hub
          </Link>
          <div className="w-px h-5 bg-white/20" />
          <h1 className="text-base font-bold tracking-tight">Build Journal</h1>
          <div className="ml-auto">
            <button
              onClick={() => loadEntries(activeTag)}
              className="text-white/40 hover:text-white transition-colors p-1"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
        {/* Tag filter bar */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button
              onClick={() => setActiveTag(null)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                !activeTag
                  ? 'bg-navy text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                  activeTag === tag
                    ? 'bg-navy text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Entries */}
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <RefreshCw className="w-6 h-6 text-gray-300 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Loading journal...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">No journal entries yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {dateKeys.map((dateKey) => (
              <div key={dateKey}>
                {/* Date header */}
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2.5">
                  {dateKey === 'unknown' ? 'Unknown date' : formatDateHeading(dateKey)}
                </h2>

                <div className="space-y-3">
                  {grouped[dateKey].map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
                    >
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h3 className="text-sm font-bold text-gray-800">{entry.title}</h3>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {entry.created_by === 'claude' ? (
                            <span className="flex items-center gap-1 text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">
                              <Bot className="w-2.5 h-2.5" />
                              claude
                            </span>
                          ) : entry.created_by ? (
                            <span className="flex items-center gap-1 text-[10px] text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full">
                              <User className="w-2.5 h-2.5" />
                              {entry.created_by}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Tags */}
                      {entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {entry.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Markdown body */}
                      <div
                        className="wiki-content"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.body) }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
