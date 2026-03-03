import { Plus, Loader2 } from 'lucide-react';
import type { CleaningSheet } from '../types';

interface Props {
  sheets: CleaningSheet[];
  loading: boolean;
  onSelect: (sheet: CleaningSheet) => void;
  onCreate: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  fire: 'bg-red-100 text-red-700',
  water: 'bg-blue-100 text-blue-700',
  'post-construction': 'bg-amber-100 text-amber-700',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  'in-progress': 'bg-sky-100 text-sky-700',
  complete: 'bg-emerald-100 text-emerald-700',
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CleaningSheetList({ sheets, loading, onSelect, onCreate }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={onCreate}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-navy text-white rounded-lg font-semibold text-sm hover:bg-navy-light transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Cleaning Sheet
      </button>

      {sheets.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No sheets yet</p>
      )}

      {sheets.map(sheet => (
        <button
          key={sheet.id}
          onClick={() => onSelect(sheet)}
          className="w-full flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-navy/30 hover:shadow-sm transition-all text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 truncate">
              {sheet.customer || 'Untitled'}
            </div>
            <div className="text-xs text-gray-400 truncate">
              {sheet.address || 'No address'}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_COLORS[sheet.cleaning_type] || ''}`}>
              {sheet.cleaning_type.replace('-', ' ').toUpperCase()}
            </span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLORS[sheet.status] || ''}`}>
              {sheet.status.replace('-', ' ').toUpperCase()}
            </span>
          </div>
          <div className="text-xs text-gray-300 shrink-0 w-12 text-right">
            {formatDate(sheet.updated_at)}
          </div>
        </button>
      ))}
    </div>
  );
}
