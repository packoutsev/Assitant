import { useState, useEffect, useMemo } from 'react';
import { Package, ScanLine, X } from 'lucide-react';
import type { BoxItem } from '../types';

interface VaultInventoryProps {
  vaultId: string;
  vaultNum: string;
  onScan: () => void;
}

export default function VaultInventory({ vaultId, vaultNum, onScan }: VaultInventoryProps) {
  const [items, setItems] = useState<BoxItem[]>([]);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vault-manager-boxes');
      if (saved) {
        const all: BoxItem[] = JSON.parse(saved);
        setItems(all.filter(b => b.vaultId === vaultId && b.scannedOut === null));
      }
    } catch { /* ignore */ }
  }, [vaultId]);

  const boxes = useMemo(() => items.filter(i => i.type === 'box'), [items]);
  const tags = useMemo(() => items.filter(i => i.type === 'tag'), [items]);

  // Group by room
  const byRoom = useMemo(() => {
    const map = new Map<string, BoxItem[]>();
    for (const item of items) {
      const room = item.room || 'Unassigned';
      const list = map.get(room) || [];
      list.push(item);
      map.set(room, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  const removeItem = (itemId: string) => {
    try {
      const saved = localStorage.getItem('vault-manager-boxes');
      if (saved) {
        const all: BoxItem[] = JSON.parse(saved);
        const updated = all.map(b =>
          b.id === itemId ? { ...b, scannedOut: Date.now() } : b
        );
        localStorage.setItem('vault-manager-boxes', JSON.stringify(updated));
        setItems(prev => prev.filter(b => b.id !== itemId));
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-300">
            Contents
          </span>
          {items.length > 0 && (
            <span className="text-[10px] text-gray-500">
              {boxes.length} box{boxes.length !== 1 ? 'es' : ''}, {tags.length} TAG{tags.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={onScan}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
                     bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <ScanLine className="w-3 h-3" />
          Scan
        </button>
      </div>

      {items.length === 0 ? (
        <div className="px-3 py-4 text-center">
          <p className="text-xs text-gray-500">No items scanned into vault #{vaultNum}</p>
          <button
            onClick={onScan}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300"
          >
            Scan items with QR camera
          </button>
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {byRoom.map(([room, roomItems]) => (
            <div key={room}>
              <div className="px-3 py-1 bg-gray-800/30 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                {room} ({roomItems.length})
              </div>
              {roomItems.map(item => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-gray-800/30">
                  <span className={`font-bold px-1 py-0.5 rounded text-[9px] text-white flex-shrink-0 ${
                    item.type === 'tag' ? 'bg-red-600' : 'bg-green-600'
                  }`}>
                    {item.type === 'tag' ? 'TAG' : 'BOX'}
                  </span>
                  <span className="font-mono font-bold text-gray-200">#{item.itemNumber}</span>
                  {item.description && (
                    <span className="text-gray-500 truncate flex-1">{item.description}</span>
                  )}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="ml-auto text-gray-600 hover:text-red-400 p-0.5"
                    title="Scan out of vault"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
