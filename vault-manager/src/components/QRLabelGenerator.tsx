import { useState, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, Plus, Trash2, Package, Tag } from 'lucide-react';
import { encodeQRPayload } from '../types';
import { useWarehouse } from '../contexts/WarehouseContext';

interface LabelItem {
  id: string;
  type: 'box' | 'tag';
  itemNumber: string;
  customer: string;
  projectNumber: string;
  packoutDate: string;
}

/** Brother QL label: 62mm wide continuous roll.
 *  62mm x 40mm label (landscape) for each box/tag sticker. */
const LABEL_W_MM = 62;
const LABEL_H_MM = 40;

const TAG_BG = '#dc2626';
const BOX_BG = '#16a34a';

export default function QRLabelGenerator({ onClose }: { onClose: () => void }) {
  const { customers } = useWarehouse();
  const printRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<LabelItem[]>([]);
  const [boxCount, setBoxCount] = useState('0');
  const [tagCount, setTagCount] = useState('0');
  const [boxStart, setBoxStart] = useState('1');
  const [tagStart, setTagStart] = useState('1');
  const [customer, setCustomer] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [packoutDate, setPackoutDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  const allCustomerNames = customers.map(c => c.name).sort();

  // Always auto-fill project number when a customer is selected
  const handleCustomerChange = (name: string) => {
    setCustomer(name);
    const match = customers.find(c => c.name === name || c.aliases.includes(name));
    if (match?.claimId) {
      setProjectNumber(match.claimId);
    }
  };

  const generateLabels = useCallback(() => {
    if (!customer) return;
    const nBoxes = parseInt(boxCount, 10) || 0;
    const nTags = parseInt(tagCount, 10) || 0;
    if (nBoxes === 0 && nTags === 0) return;

    const bStart = parseInt(boxStart, 10) || 1;
    const tStart = parseInt(tagStart, 10) || 1;
    const newItems: LabelItem[] = [];

    for (let i = 0; i < nBoxes; i++) {
      const num = String(bStart + i);
      newItems.push({
        id: `box-${num}-${Date.now()}-${i}`,
        type: 'box',
        itemNumber: num,
        customer,
        projectNumber,
        packoutDate,
      });
    }

    for (let i = 0; i < nTags; i++) {
      const num = String(tStart + i);
      newItems.push({
        id: `tag-${num}-${Date.now()}-${i}`,
        type: 'tag',
        itemNumber: num,
        customer,
        projectNumber,
        packoutDate,
      });
    }

    setItems(prev => [...prev, ...newItems]);
    if (nBoxes > 0) setBoxStart(String(bStart + nBoxes));
    if (nTags > 0) setTagStart(String(tStart + nTags));
    setBoxCount('0');
    setTagCount('0');
  }, [boxCount, tagCount, boxStart, tagStart, customer, projectNumber, packoutDate]);

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const handlePrint = () => {
    if (!printRef.current || items.length === 0) return;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>Labels - 1-800-Packouts</title>
<style>
  @page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label {
    width: ${LABEL_W_MM}mm;
    height: ${LABEL_H_MM}mm;
    page-break-after: always;
    display: flex;
    align-items: center;
    gap: 2mm;
    padding: 2mm;
    overflow: hidden;
    color: #000;
  }
  .label:last-child { page-break-after: auto; }
  .tag-label { background: ${TAG_BG}; }
  .box-label { background: ${BOX_BG}; }
  .qr-wrap {
    flex-shrink: 0;
    padding: 1mm;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .qr-wrap svg { width: 24mm; height: 24mm; }
  .info {
    flex: 1;
    min-width: 0;
    color: #000;
  }
  .info .type-num { font-size: 18pt; font-weight: 900; line-height: 1; }
  .info .project { font-size: 9pt; font-weight: 800; margin-top: 1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .info .project-id { font-size: 8pt; font-weight: 700; margin-top: 0.5mm; }
  .info .date { font-size: 7pt; font-weight: 600; margin-top: 0.5mm; }
  .info .brand { font-size: 5pt; margin-top: 1.5mm; opacity: 0.7; }
</style>
</head><body>`);

    printWindow.document.write(printRef.current.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  const formatDate = (d: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${m}/${day}/${y}`;
  };

  const labelBg = (item: LabelItem) => item.type === 'tag' ? TAG_BG : BOX_BG;

  const totalQueued = items.length;
  const boxesQueued = items.filter(i => i.type === 'box').length;
  const tagsQueued = items.filter(i => i.type === 'tag').length;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-4 md:inset-y-4 md:left-[10%] md:right-[10%] bg-gray-900 border border-gray-700 rounded-xl z-50 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-bold text-gray-100">Print Job Labels</h2>
            <span className="text-xs text-gray-500">Brother QL — 62mm</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: controls */}
          <div className="w-80 flex-shrink-0 border-r border-gray-700 p-4 space-y-3 overflow-y-auto">
            {/* Project Name */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Project Name</label>
              <input
                type="text"
                list="label-customer-list"
                value={customer}
                onChange={e => handleCustomerChange(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                placeholder="Customer / job name..."
              />
              <datalist id="label-customer-list">
                {allCustomerNames.map(name => <option key={name} value={name} />)}
              </datalist>
            </div>

            {/* Project Number */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Project Number</label>
              <input
                type="text"
                value={projectNumber}
                onChange={e => setProjectNumber(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                placeholder="e.g. 25-91-C"
              />
            </div>

            {/* Packout Date */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Packout Date</label>
              <input
                type="date"
                value={packoutDate}
                onChange={e => setPackoutDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Boxes — green */}
            <div className="border border-green-800/50 rounded-lg p-3 space-y-2" style={{ background: 'rgba(22,163,74,0.08)' }}>
              <div className="flex items-center gap-1.5">
                <Package className="w-4 h-4 text-green-400" />
                <span className="text-sm font-bold text-green-400">Boxes</span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-500 mb-0.5">Qty</label>
                  <input
                    type="number"
                    value={boxCount}
                    onChange={e => setBoxCount(e.target.value)}
                    min="0"
                    max="200"
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-green-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-500 mb-0.5">Start #</label>
                  <input
                    type="number"
                    value={boxStart}
                    onChange={e => setBoxStart(e.target.value)}
                    min="1"
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>
            </div>

            {/* TAGs — red */}
            <div className="border border-red-800/50 rounded-lg p-3 space-y-2" style={{ background: 'rgba(220,38,38,0.08)' }}>
              <div className="flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-red-400" />
                <span className="text-sm font-bold text-red-400">TAGs</span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-500 mb-0.5">Qty</label>
                  <input
                    type="number"
                    value={tagCount}
                    onChange={e => setTagCount(e.target.value)}
                    min="0"
                    max="500"
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-500 mb-0.5">Start #</label>
                  <input
                    type="number"
                    value={tagStart}
                    onChange={e => setTagStart(e.target.value)}
                    min="1"
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={generateLabels}
              disabled={!customer || ((parseInt(boxCount) || 0) === 0 && (parseInt(tagCount) || 0) === 0)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded font-medium text-sm
                         bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              Generate Labels
            </button>

            {/* Queue */}
            {totalQueued > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-400">
                    {totalQueued} label{totalQueued !== 1 ? 's' : ''}
                    <span className="text-gray-600"> — </span>
                    {boxesQueued > 0 && <span className="text-green-400">{boxesQueued} box{boxesQueued !== 1 ? 'es' : ''}</span>}
                    {boxesQueued > 0 && tagsQueued > 0 && <span className="text-gray-600">, </span>}
                    {tagsQueued > 0 && <span className="text-red-400">{tagsQueued} TAG{tagsQueued !== 1 ? 's' : ''}</span>}
                  </span>
                  <button onClick={() => setItems([])} className="text-xs text-red-400 hover:text-red-300">Clear</button>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center gap-2 px-2 py-1 bg-gray-800 rounded text-xs">
                      <span
                        className="font-bold px-1.5 py-0.5 rounded text-[10px] text-white"
                        style={{ backgroundColor: labelBg(item) }}
                      >
                        {item.type === 'tag' ? 'TAG' : 'BOX'}
                      </span>
                      <span className="font-mono font-bold text-gray-200">#{item.itemNumber}</span>
                      <span className="text-gray-500 truncate flex-1">{item.customer}</span>
                      <button onClick={() => removeItem(item.id)} className="text-gray-600 hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: preview */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-950">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm gap-2">
                <p>Set up your job details, then generate labels</p>
                <p className="text-[10px] text-gray-700">
                  <span className="inline-block w-2.5 h-2.5 rounded" style={{ background: BOX_BG }} /> = Box (green) &nbsp;
                  <span className="inline-block w-2.5 h-2.5 rounded" style={{ background: TAG_BG }} /> = TAG (red)
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map(item => {
                  const bg = labelBg(item);
                  const payload = encodeQRPayload(item);
                  return (
                    <div
                      key={item.id}
                      className="rounded-lg shadow-lg mx-auto flex overflow-hidden"
                      style={{ width: `${LABEL_W_MM}mm`, height: `${LABEL_H_MM}mm`, backgroundColor: bg, padding: '2mm' }}
                    >
                      {/* QR — white modules on colored bg need inverted colors for scanning */}
                      <div className="flex-shrink-0 flex items-center justify-center">
                        <QRCodeSVG value={payload} size={96} level="M" bgColor="transparent" fgColor="#000000" />
                      </div>
                      {/* Info — black text on colored background */}
                      <div className="flex-1 min-w-0 overflow-hidden flex flex-col justify-center pl-[2mm]" style={{ color: '#000' }}>
                        <div className="font-black leading-none" style={{ fontSize: '18pt' }}>
                          {item.type === 'tag' ? 'TAG' : 'BOX'} {item.itemNumber}
                        </div>
                        <div className="font-extrabold mt-[1mm] truncate" style={{ fontSize: '9pt' }}>
                          {item.customer}
                        </div>
                        {item.projectNumber && (
                          <div className="font-bold mt-[0.5mm]" style={{ fontSize: '8pt' }}>
                            #{item.projectNumber}
                          </div>
                        )}
                        <div className="font-semibold mt-[0.5mm]" style={{ fontSize: '7pt' }}>
                          Packout: {formatDate(item.packoutDate)}
                        </div>
                        <div className="mt-[1mm]" style={{ fontSize: '5pt', opacity: 0.7 }}>
                          1-800-PACKOUTS East Valley
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Print-ready HTML (hidden) */}
        <div ref={printRef} className="hidden">
          {items.map(item => {
            const payload = encodeQRPayload(item);
            return (
              <div key={item.id} className={`label ${item.type === 'tag' ? 'tag-label' : 'box-label'}`}>
                <div className="qr-wrap">
                  <QRCodeSVG value={payload} size={200} level="M" bgColor="transparent" fgColor="#000000" />
                </div>
                <div className="info">
                  <div className="type-num">
                    {item.type === 'tag' ? 'TAG' : 'BOX'} {item.itemNumber}
                  </div>
                  <div className="project">{item.customer}</div>
                  {item.projectNumber && (
                    <div className="project-id">#{item.projectNumber}</div>
                  )}
                  <div className="date">Packout: {formatDate(item.packoutDate)}</div>
                  <div className="brand">1-800-PACKOUTS East Valley</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            62mm x 40mm for Brother QL continuous roll
          </span>
          <button
            onClick={handlePrint}
            disabled={items.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded font-medium text-sm
                       bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print {items.length} Label{items.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </>
  );
}
