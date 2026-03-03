import { useState } from 'react';
import { Copy, Check, ChevronLeft } from 'lucide-react';
import type { CleaningSheet } from '../types';
import { generateScopeSummary, getScopeLines } from '../utils/scope-summary';

interface Props {
  sheet: CleaningSheet;
  onBack: () => void;
}

export default function ScopeExport({ sheet, onBack }: Props) {
  const [copied, setCopied] = useState(false);
  const summary = generateScopeSummary(sheet);
  const lines = getScopeLines(sheet);
  const totalItems = lines.length;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h2 className="text-lg font-bold text-gray-800 flex-1">Scope Summary</h2>
        <span className="text-xs text-gray-400">{totalItems} line items</span>
      </div>

      {/* Structured table view */}
      {totalItems > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-3">Room</th>
                <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-3">Code</th>
                <th className="text-left text-xs font-semibold text-gray-500 py-2 pr-3">Description</th>
                <th className="text-right text-xs font-semibold text-gray-500 py-2 pr-1">Qty</th>
                <th className="text-left text-xs font-semibold text-gray-500 py-2">Unit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const prevRoom = i > 0 ? lines[i - 1].room : '';
                const showRoom = line.room !== prevRoom;
                return (
                  <tr key={i} className={showRoom ? 'border-t border-gray-200' : ''}>
                    <td className="py-1.5 pr-3 font-semibold text-gray-700 align-top whitespace-nowrap">
                      {showRoom ? line.room : ''}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-xs text-navy whitespace-nowrap">{line.code}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{line.description}</td>
                    <td className="py-1.5 pr-1 text-right font-medium">{line.quantity}</td>
                    <td className="py-1.5 text-gray-400 text-xs">{line.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-8">No items scoped yet</p>
      )}

      {/* Copy button */}
      {totalItems > 0 && (
        <>
          {/* Raw text preview */}
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1">RAW TEXT (for pasting)</div>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 overflow-x-auto whitespace-pre font-mono max-h-64 overflow-y-auto">
              {summary}
            </pre>
          </div>

          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-navy text-white rounded-lg font-semibold text-sm hover:bg-navy-light transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </>
      )}
    </div>
  );
}
