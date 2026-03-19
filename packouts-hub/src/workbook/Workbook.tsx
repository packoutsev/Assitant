import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, Bot, User, Pencil, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  tablePlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  InsertTable,
  type MDXEditorMethods,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
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

function downloadMarkdown(entries: JournalEntry[], dateKey: string) {
  const dayEntries = entries.filter(e => e.date === dateKey);
  const heading = `# Workbook - ${formatDateHeading(dateKey)}\n\n`;
  const content = dayEntries.map(e => `## ${e.title}\n\n${e.body}`).join('\n\n---\n\n');
  const blob = new Blob([heading + content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workbook-${dateKey}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Editable Entry Card
// ---------------------------------------------------------------------------

function EntryCard({ entry, onSaved }: { entry: JournalEntry; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const editorRef = useRef<MDXEditorMethods>(null);

  const startEdit = () => {
    setEditTitle(entry.title);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditTitle(entry.title);
  };

  const saveEdit = async () => {
    const md = editorRef.current?.getMarkdown() || entry.body;
    setSaving(true);
    try {
      await getMcpClient('xcelerate').callTool('update_journal_entry', {
        entry_id: entry.id,
        title: editTitle,
        body: md,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    setSaving(false);
  };

  return (
    <div className={`bg-white rounded-xl border transition-all ${editing ? 'border-navy/30 shadow-md ring-1 ring-navy/10' : 'border-gray-200 shadow-sm'}`}>
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => !editing && setCollapsed(!collapsed)}
            className="text-gray-300 hover:text-gray-500 transition-colors shrink-0 mt-0.5"
          >
            {collapsed && !editing
              ? <ChevronRight className="w-4 h-4" />
              : <ChevronDown className="w-4 h-4" />
            }
          </button>
          {editing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-sm font-bold text-gray-800 w-full bg-transparent border-b border-navy/20 focus:border-navy/50 focus:outline-none py-0.5"
            />
          ) : (
            <h3
              className="text-sm font-bold text-gray-800 cursor-pointer hover:text-navy transition-colors"
              onClick={() => setCollapsed(!collapsed)}
            >
              {entry.title}
            </h3>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {editing ? (
            <>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-navy text-white rounded-lg hover:bg-navy-light transition-colors disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save
              </button>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-300 hover:text-navy transition-colors rounded-lg hover:bg-gray-50"
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
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
      {entry.tags.length > 0 && !collapsed && (
        <div className="flex flex-wrap gap-1 px-5 pb-2">
          {entry.tags
            .filter((t) => t !== 'workbook')
            .map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full"
              >
                {tag}
              </span>
            ))}
        </div>
      )}

      {/* Body */}
      {!collapsed && (
        <div className="px-5 pb-5">
          {editing ? (
            <div className="workbook-editor border border-gray-200 rounded-lg overflow-hidden">
              <MDXEditor
                ref={editorRef}
                markdown={entry.body}
                plugins={[
                  headingsPlugin(),
                  listsPlugin(),
                  quotePlugin(),
                  thematicBreakPlugin(),
                  tablePlugin(),
                  markdownShortcutPlugin(),
                  toolbarPlugin({
                    toolbarContents: () => (
                      <>
                        <BlockTypeSelect />
                        <BoldItalicUnderlineToggles />
                        <ListsToggle />
                        <InsertTable />
                      </>
                    ),
                  }),
                ]}
              />
            </div>
          ) : (
            <div
              className="wiki-content cursor-pointer hover:bg-gray-50/50 rounded-lg transition-colors -mx-2 px-2 py-1"
              onClick={startEdit}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.body) }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Workbook Page
// ---------------------------------------------------------------------------

export default function Workbook() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMcpClient('xcelerate').callTool<JournalEntry[]>('list_journal', {
        tag: 'workbook',
        limit: 100,
      });
      setEntries(result || []);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

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
          <h1 className="text-base font-bold tracking-tight">Daily Workbook</h1>
          <div className="ml-auto">
            <button
              onClick={loadEntries}
              className="text-white/40 hover:text-white transition-colors p-1"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <RefreshCw className="w-6 h-6 text-gray-300 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Loading workbook...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-sm text-gray-400">No workbook entries yet.</p>
            <p className="text-xs text-gray-300 mt-1">
              Entries tagged "workbook" in the Build Journal will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {dateKeys.map((dateKey) => (
              <div key={dateKey}>
                <div className="flex items-center justify-between mb-2.5">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    {dateKey === 'unknown' ? 'Unknown date' : formatDateHeading(dateKey)}
                  </h2>
                  <button
                    onClick={() => downloadMarkdown(entries, dateKey)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-navy transition-colors"
                    title="Download as Markdown"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                </div>

                <div className="space-y-3">
                  {grouped[dateKey].map((entry) => (
                    <EntryCard key={entry.id} entry={entry} onSaved={loadEntries} />
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
