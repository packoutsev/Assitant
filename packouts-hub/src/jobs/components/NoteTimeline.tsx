import { MessageSquare } from 'lucide-react';
import type { EncircleNote } from '../types';

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Extract display name from email (e.g. "diana.ocegueda@1800packouts.com" → "Diana Ocegueda")
function formatAuthor(email?: string): string | undefined {
  if (!email) return undefined;
  const local = email.split('@')[0];
  return local
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

const TITLE_STYLES: Record<string, string> = {
  'packout instructions': 'bg-amber-50 text-amber-700',
  'note': 'bg-blue-50 text-blue-700',
  'scope': 'bg-purple-50 text-purple-700',
};

export default function NoteTimeline({ notes }: { notes: EncircleNote[] }) {
  if (notes.length === 0) {
    return <p className="text-gray-400 text-sm py-8 text-center">No notes found for this job in Encircle.</p>;
  }

  return (
    <div className="space-y-4">
      {notes.map((note) => {
        const titleKey = (note.title || '').toLowerCase();
        const titleStyle = TITLE_STYLES[titleKey] || 'bg-gray-100 text-gray-600';
        const author = formatAuthor(note.author);

        return (
          <div key={note.id} className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-navy/5 flex items-center justify-center mt-0.5">
              <MessageSquare className="w-4 h-4 text-navy/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {author && (
                  <span className="text-sm font-semibold text-gray-800">{author}</span>
                )}
                {note.title && (
                  <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${titleStyle}`}>
                    {note.title}
                  </span>
                )}
                {note.room && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                    {note.room}
                  </span>
                )}
                {note.created_at && (
                  <span className="text-xs text-gray-400">{formatDate(note.created_at)}</span>
                )}
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{note.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
