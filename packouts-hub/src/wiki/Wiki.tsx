import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Search, X, Cloud, HardDrive, RefreshCw } from 'lucide-react';
import { marked } from 'marked';
import { getMcpClient } from '../jobs/McpClient';
import wikiRaw from './WIKI.md?raw';

// Build table of contents from markdown headings
interface TocItem {
  level: number;
  text: string;
  id: string;
}

function buildToc(md: string): TocItem[] {
  const items: TocItem[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^(#{2,3})\s+(.+)/);
    if (m) {
      const text = m[2].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '');
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      items.push({ level: m[1].length, text, id });
    }
  }
  return items;
}

function renderMarkdown(md: string): string {
  marked.setOptions({ gfm: true, breaks: false });

  const renderer = new marked.Renderer();
  renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
    const clean = text.replace(/<[^>]+>/g, '');
    const id = clean
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `<h${depth} id="${id}" class="scroll-mt-20">${text}</h${depth}>`;
  };

  const result = marked.parse(md, { renderer });
  return typeof result === 'string' ? result : '';
}

type Source = 'live' | 'static';

interface WikiMeta {
  version: number;
  updated_at: string | null;
  updated_by: string | null;
}

export default function Wiki() {
  const [html, setHtml] = useState('');
  const [toc, setToc] = useState<TocItem[]>([]);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState('');
  const [source, setSource] = useState<Source>('static');
  const [meta, setMeta] = useState<WikiMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMcpClient('xcelerate').callTool<{
        content: string;
        version: number;
        updated_at: string | null;
        updated_by: string | null;
      } | null>('get_wiki_page', { page_id: 'main' });

      if (result && result.content) {
        setHtml(renderMarkdown(result.content));
        setToc(buildToc(result.content));
        setSource('live');
        setMeta({ version: result.version, updated_at: result.updated_at, updated_by: result.updated_by });
        setLoading(false);
        return;
      }
    } catch {
      // Firestore unavailable — fall back to static
    }

    // Fallback to static bundled markdown
    setHtml(renderMarkdown(wikiRaw));
    setToc(buildToc(wikiRaw));
    setSource('static');
    setMeta(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  // Track active section on scroll
  useEffect(() => {
    if (!toc.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );
    for (const item of toc) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [toc]);

  const filteredToc = search
    ? toc.filter((t) => t.text.toLowerCase().includes(search.toLowerCase()))
    : toc;

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-warm">
      {/* Header */}
      <header className="bg-navy text-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors text-sm shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Hub
          </Link>
          <div className="w-px h-5 bg-white/20" />
          <h1 className="text-base font-bold tracking-tight">Technical Wiki</h1>
          <div className="ml-auto flex items-center gap-2">
            {/* Source indicator */}
            <div className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full ${
              source === 'live' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'
            }`}>
              {source === 'live' ? <Cloud className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
              {source === 'live' ? 'Live' : 'Static fallback'}
              {meta && <span className="opacity-60">v{meta.version}</span>}
            </div>
            <button
              onClick={loadContent}
              className="text-white/40 hover:text-white transition-colors p-1"
              title="Refresh from Firestore"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Meta bar */}
      {meta && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3">
          <div className="text-[10px] text-gray-400">
            Last updated {formatDate(meta.updated_at)} by {meta.updated_by || 'unknown'} — version {meta.version}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex gap-6">
        {/* Sidebar TOC — desktop */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto">
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search sections..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/30"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-2.5">
                  <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
            <nav className="space-y-0.5">
              {filteredToc.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={`block w-full text-left text-xs py-1 transition-colors rounded ${
                    item.level === 3 ? 'pl-5' : 'pl-2 font-semibold'
                  } ${
                    activeId === item.id
                      ? 'text-navy bg-navy/5'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  {item.level === 3 && (
                    <ChevronRight className="w-2.5 h-2.5 inline mr-1 opacity-40" />
                  )}
                  {item.text}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <RefreshCw className="w-6 h-6 text-gray-300 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Loading wiki...</p>
            </div>
          ) : (
            <div
              className="wiki-content bg-white rounded-xl border border-gray-200 p-6 sm:p-8 shadow-sm"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
