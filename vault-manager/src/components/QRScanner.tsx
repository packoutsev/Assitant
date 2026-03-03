import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, ScanLine, Check, AlertCircle } from 'lucide-react';
import { decodeQRPayload } from '../types';
import type { BoxItem } from '../types';
import { useWarehouse } from '../contexts/WarehouseContext';

interface QRScannerProps {
  vaultId: string;
  onClose: () => void;
}

export default function QRScanner({ vaultId, onClose }: QRScannerProps) {
  const { getVault, dispatch } = useWarehouse();
  const vault = getVault(vaultId);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<{ item: BoxItem; isNew: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<BoxItem[]>([]);

  // Load existing items for this vault from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vault-manager-boxes');
      if (saved) {
        const all: BoxItem[] = JSON.parse(saved);
        setScannedItems(all.filter(b => b.vaultId === vaultId && b.scannedOut === null));
      }
    } catch { /* ignore */ }
  }, [vaultId]);

  const saveItems = useCallback((items: BoxItem[]) => {
    try {
      const saved = localStorage.getItem('vault-manager-boxes');
      const all: BoxItem[] = saved ? JSON.parse(saved) : [];
      // Replace items for this vault, keep other vaults
      const others = all.filter(b => b.vaultId !== vaultId);
      localStorage.setItem('vault-manager-boxes', JSON.stringify([...others, ...items]));
    } catch { /* ignore */ }
  }, [vaultId]);

  const handleScan = useCallback((decodedText: string) => {
    const parsed = decodeQRPayload(decodedText);
    if (!parsed) {
      setError(`Not a 1-800-Packouts label: ${decodedText.slice(0, 50)}`);
      return;
    }

    // Check if already scanned into this vault
    const existing = scannedItems.find(
      b => b.type === parsed.type && b.itemNumber === parsed.itemNumber && b.customer === parsed.customer
    );

    if (existing) {
      setLastScan({ item: existing, isNew: false });
      setError(null);
      return;
    }

    const newItem: BoxItem = {
      id: `${parsed.type}-${parsed.itemNumber}-${Date.now()}`,
      type: parsed.type,
      itemNumber: parsed.itemNumber,
      customer: parsed.customer,
      projectNumber: parsed.projectNumber,
      packoutDate: parsed.packoutDate,
      vaultId,
      scannedIn: Date.now(),
      scannedOut: null,
    };

    const updated = [...scannedItems, newItem];
    setScannedItems(updated);
    saveItems(updated);
    setLastScan({ item: newItem, isNew: true });
    setError(null);

    // Log activity
    dispatch({
      type: 'LOG_ACTIVITY',
      entry: {
        action: 'assign',
        vaultId,
        vaultNum: vault?.vaultNum || '',
        details: `Scanned ${parsed.type.toUpperCase()} #${parsed.itemNumber} (${parsed.customer}) into vault`,
        user: 'Admin',
      },
    });
  }, [scannedItems, vaultId, vault, dispatch, saveItems]);

  const startScanner = useCallback(async () => {
    if (!containerRef.current) return;
    setError(null);

    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => { /* ignore scan failures */ }
      );
      setScanning(true);
    } catch (err) {
      setError(`Camera error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [handleScan]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const removeItem = (itemId: string) => {
    const updated = scannedItems.filter(b => b.id !== itemId);
    setScannedItems(updated);
    saveItems(updated);
  };

  if (!vault) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose} />
      <div className="fixed inset-4 md:inset-y-8 md:left-[15%] md:right-[15%] bg-gray-900 border border-gray-700 rounded-xl z-50 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <div className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold text-gray-100">
                Scan into Vault #{vault.vaultNum}
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {vault.customer || 'Empty vault'} &middot; {scannedItems.length} item{scannedItems.length !== 1 ? 's' : ''} scanned
            </p>
          </div>
          <button onClick={() => { stopScanner(); onClose(); }} className="p-1.5 rounded hover:bg-gray-800 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Camera */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 bg-black/30">
            <div
              ref={containerRef}
              id="qr-reader"
              className="w-full max-w-sm aspect-square rounded-lg overflow-hidden bg-gray-800"
            />

            {!scanning ? (
              <button
                onClick={startScanner}
                className="mt-4 flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm
                           bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                <Camera className="w-5 h-5" />
                Start Camera
              </button>
            ) : (
              <button
                onClick={stopScanner}
                className="mt-4 flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm
                           bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              >
                Stop Camera
              </button>
            )}

            {/* Last scan feedback */}
            {lastScan && (
              <div className={`mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
                lastScan.isNew
                  ? 'bg-green-900/40 text-green-400 border border-green-800'
                  : 'bg-yellow-900/40 text-yellow-400 border border-yellow-800'
              }`}>
                {lastScan.isNew ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>
                  {lastScan.isNew ? 'Added' : 'Already in vault'}:{' '}
                  <span className="font-bold">{lastScan.item.type.toUpperCase()} #{lastScan.item.itemNumber}</span>
                </span>
              </div>
            )}

            {error && (
              <div className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-red-900/40 text-red-400 border border-red-800">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </div>

          {/* Scanned items list */}
          <div className="w-full md:w-72 border-t md:border-t-0 md:border-l border-gray-700 flex flex-col">
            <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/50">
              <span className="text-xs font-medium text-gray-300">
                Items in Vault #{vault.vaultNum}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {scannedItems.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-gray-600 text-xs">
                  No items scanned yet
                </div>
              ) : (
                scannedItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/50 text-xs">
                    <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] text-white ${
                      item.type === 'tag'
                        ? 'bg-red-600'
                        : 'bg-green-600'
                    }`}>
                      {item.type === 'tag' ? 'TAG' : 'BOX'}
                    </span>
                    <span className="font-mono font-bold text-gray-200">#{item.itemNumber}</span>
                    <span className="text-gray-500 truncate flex-1">
                      {item.customer}
                    </span>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-gray-600 hover:text-red-400 p-0.5"
                      title="Remove from vault"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
