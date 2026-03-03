import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, ScanLine, LogIn, LogOut } from 'lucide-react';
import { decodeQRPayload } from '../types';
import type { BoxItem } from '../types';
import { useWarehouse } from '../contexts/WarehouseContext';

type ScanMode = 'in' | 'out';

interface ScanEvent {
  id: string;
  type: 'box' | 'tag';
  itemNumber: string;
  customer: string;
  result: 'added' | 'removed' | 'duplicate' | 'not-found' | 'error';
  message: string;
  timestamp: number;
}

export default function QuickScan({ onClose }: { onClose: () => void }) {
  const { getAllVaults, dispatch } = useWarehouse();
  const allVaults = getAllVaults();

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<ScanMode>('in');
  const [vaultNum, setVaultNum] = useState('');
  const [feed, setFeed] = useState<ScanEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Debounce: ignore same QR within 2s
  const lastCodeRef = useRef<string>('');
  const lastCodeTimeRef = useRef<number>(0);

  // Session counts
  const addedCount = feed.filter(e => e.result === 'added').length;
  const removedCount = feed.filter(e => e.result === 'removed').length;

  // Resolve vault num to vault id
  const resolveVault = useCallback((num: string) => {
    return allVaults.find(v => v.vaultNum === num);
  }, [allVaults]);

  const loadBoxes = useCallback((): BoxItem[] => {
    try {
      const saved = localStorage.getItem('vault-manager-boxes');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  }, []);

  const saveBoxes = useCallback((boxes: BoxItem[]) => {
    localStorage.setItem('vault-manager-boxes', JSON.stringify(boxes));
  }, []);

  const pushFeed = useCallback((event: Omit<ScanEvent, 'id' | 'timestamp'>) => {
    setFeed(prev => [{
      ...event,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
    }, ...prev].slice(0, 50));
  }, []);

  const handleScan = useCallback((decodedText: string) => {
    // Debounce same code
    const now = Date.now();
    if (decodedText === lastCodeRef.current && now - lastCodeTimeRef.current < 2000) return;
    lastCodeRef.current = decodedText;
    lastCodeTimeRef.current = now;

    const parsed = decodeQRPayload(decodedText);
    if (!parsed) {
      pushFeed({
        type: 'box',
        itemNumber: '?',
        customer: '',
        result: 'error',
        message: `Not a 1-800-Packouts label`,
      });
      return;
    }

    if (!vaultNum) {
      pushFeed({
        type: parsed.type,
        itemNumber: parsed.itemNumber,
        customer: parsed.customer,
        result: 'error',
        message: 'Select a vault first',
      });
      return;
    }

    const vault = resolveVault(vaultNum);
    const vaultId = vault?.id || `manual-${vaultNum}`;
    const all = loadBoxes();

    if (mode === 'in') {
      // Check duplicate
      const existing = all.find(
        b => b.type === parsed.type && b.itemNumber === parsed.itemNumber
          && b.customer === parsed.customer && b.scannedOut === null
      );
      if (existing) {
        const loc = existing.vaultId === vaultId ? 'this vault' : `vault ${allVaults.find(v => v.id === existing.vaultId)?.vaultNum || '?'}`;
        pushFeed({
          type: parsed.type,
          itemNumber: parsed.itemNumber,
          customer: parsed.customer,
          result: 'duplicate',
          message: `Already in ${loc}`,
        });
        return;
      }

      const newItem: BoxItem = {
        id: `${parsed.type}-${parsed.itemNumber}-${now}`,
        type: parsed.type,
        itemNumber: parsed.itemNumber,
        customer: parsed.customer,
        projectNumber: parsed.projectNumber,
        packoutDate: parsed.packoutDate,
        vaultId,
        scannedIn: now,
        scannedOut: null,
      };
      all.push(newItem);
      saveBoxes(all);

      pushFeed({
        type: parsed.type,
        itemNumber: parsed.itemNumber,
        customer: parsed.customer,
        result: 'added',
        message: `→ Vault #${vaultNum}`,
      });

      dispatch({
        type: 'LOG_ACTIVITY',
        entry: {
          action: 'assign',
          vaultId,
          vaultNum,
          details: `Scanned ${parsed.type.toUpperCase()} #${parsed.itemNumber} (${parsed.customer}) IN`,
          user: 'Admin',
        },
      });

    } else {
      // Scan OUT — find the item currently in any vault
      const idx = all.findIndex(
        b => b.type === parsed.type && b.itemNumber === parsed.itemNumber
          && b.customer === parsed.customer && b.scannedOut === null
      );
      if (idx === -1) {
        pushFeed({
          type: parsed.type,
          itemNumber: parsed.itemNumber,
          customer: parsed.customer,
          result: 'not-found',
          message: 'Not currently in any vault',
        });
        return;
      }

      all[idx] = { ...all[idx], scannedOut: now };
      saveBoxes(all);

      pushFeed({
        type: parsed.type,
        itemNumber: parsed.itemNumber,
        customer: parsed.customer,
        result: 'removed',
        message: `← Out of vault`,
      });

      dispatch({
        type: 'LOG_ACTIVITY',
        entry: {
          action: 'unassign',
          vaultId: all[idx].vaultId,
          vaultNum,
          details: `Scanned ${parsed.type.toUpperCase()} #${parsed.itemNumber} (${parsed.customer}) OUT`,
          user: 'Admin',
        },
      });
    }
  }, [vaultNum, mode, resolveVault, loadBoxes, saveBoxes, pushFeed, allVaults, dispatch]);

  const startScanner = useCallback(async () => {
    if (!containerRef.current) return;
    setError(null);
    try {
      const scanner = new Html5Qrcode('qs-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 280, height: 280 }, aspectRatio: 1 },
        (text) => handleScan(text),
        () => {},
      );
      setScanning(true);
    } catch (err) {
      setError(`Camera: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [handleScan]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch { /* */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { scannerRef.current?.stop().catch(() => {}); };
  }, []);

  // Auto-start camera
  useEffect(() => {
    if (vaultNum && !scanning && containerRef.current) {
      startScanner();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultNum]);

  const occupiedVaultNums = [...new Set(allVaults.filter(v => v.vaultNum).map(v => v.vaultNum))].sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const feedColor = (r: ScanEvent['result']) => {
    switch (r) {
      case 'added': return 'bg-green-900/60 border-green-700 text-green-300';
      case 'removed': return 'bg-orange-900/60 border-orange-700 text-orange-300';
      case 'duplicate': return 'bg-yellow-900/60 border-yellow-700 text-yellow-300';
      case 'not-found': return 'bg-gray-800 border-gray-600 text-gray-400';
      case 'error': return 'bg-red-900/60 border-red-700 text-red-300';
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-900">
        <ScanLine className="w-5 h-5 text-blue-400" />
        <span className="text-sm font-bold text-gray-100">Quick Scan</span>

        {/* In/Out toggle */}
        <div className="flex bg-gray-800 rounded-lg p-0.5 ml-2">
          <button
            onClick={() => setMode('in')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold transition-colors
              ${mode === 'in' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <LogIn className="w-3.5 h-3.5" />
            IN
          </button>
          <button
            onClick={() => setMode('out')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold transition-colors
              ${mode === 'out' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <LogOut className="w-3.5 h-3.5" />
            OUT
          </button>
        </div>

        {/* Vault selector */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] text-gray-500 uppercase font-medium">Vault</span>
          <select
            value={vaultNum}
            onChange={e => setVaultNum(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm font-mono font-bold text-gray-100 focus:outline-none focus:border-blue-500 min-w-[70px]"
          >
            <option value="">--</option>
            {occupiedVaultNums.map(num => (
              <option key={num} value={num}>#{num}</option>
            ))}
          </select>
        </div>

        <button onClick={() => { stopScanner(); onClose(); }} className="p-1.5 rounded hover:bg-gray-800 text-gray-400 ml-1">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Session stats */}
      <div className="flex-shrink-0 flex items-center justify-center gap-6 px-3 py-2 bg-gray-900/50 border-b border-gray-800/50">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-gray-400">In:</span>
          <span className="text-sm font-bold text-green-400 font-mono">{addedCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-xs text-gray-400">Out:</span>
          <span className="text-sm font-bold text-orange-400 font-mono">{removedCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Total:</span>
          <span className="text-sm font-bold text-gray-300 font-mono">{feed.length}</span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!vaultNum ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <ScanLine className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Select a vault to start scanning</p>
            </div>
          </div>
        ) : (
          <>
            {/* Camera */}
            <div className="flex-shrink-0 flex justify-center p-2 bg-black">
              <div
                ref={containerRef}
                id="qs-reader"
                className="w-full max-w-xs aspect-square rounded-lg overflow-hidden bg-gray-900"
              />
            </div>

            {error && (
              <div className="mx-3 mt-2 px-3 py-2 rounded text-xs bg-red-900/40 text-red-400 border border-red-800">
                {error}
              </div>
            )}

            {!scanning && vaultNum && (
              <div className="flex justify-center p-2">
                <button
                  onClick={startScanner}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white"
                >
                  Start Camera
                </button>
              </div>
            )}

            {/* Live feed */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {feed.map(event => (
                <div
                  key={event.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs ${feedColor(event.result)}`}
                >
                  <span className={`font-bold px-1 py-0.5 rounded text-[9px] text-white flex-shrink-0 ${
                    event.type === 'tag' ? 'bg-red-600' : 'bg-green-600'
                  }`}>
                    {event.type === 'tag' ? 'TAG' : 'BOX'}
                  </span>
                  <span className="font-mono font-bold">#{event.itemNumber}</span>
                  <span className="truncate flex-1">{event.message}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
