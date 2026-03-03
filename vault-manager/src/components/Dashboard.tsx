import { Package, PackageOpen, Boxes, AlertTriangle } from 'lucide-react';
import { useWarehouse } from '../contexts/WarehouseContext';

export default function Dashboard() {
  const { getAllVaults } = useWarehouse();
  const vaults = getAllVaults();

  const occupied = vaults.filter(v => v.status === 'occupied').length;
  const empty = vaults.filter(v => v.status === 'empty').length;
  const pallets = vaults.filter(v => v.status === 'pallet').length;
  const mold = vaults.filter(v => v.status === 'mold').length;
  const total = vaults.length;
  const utilization = total > 0 ? Math.round((occupied + pallets + mold) / total * 100) : 0;

  const arPastDue = vaults.filter(v => v.flagReason === 'ar-past-due').length;
  const arEscalated = vaults.filter(v => v.flagReason === 'ar-escalated').length;
  const moldFlag = vaults.filter(v => v.flagReason === 'mold-hazard').length;
  const needsVerify = vaults.filter(v => v.flagReason === 'needs-verify').length;
  const totalFlags = vaults.filter(v => v.flagReason !== null).length;

  const stats = [
    { label: 'Occupied', value: occupied, icon: Package, color: 'text-slate-400', bg: 'bg-slate-800/50' },
    { label: 'Empty', value: empty, icon: PackageOpen, color: 'text-green-400', bg: 'bg-green-900/30' },
    { label: 'Pallets', value: pallets, icon: Boxes, color: 'text-amber-400', bg: 'bg-amber-900/30' },
    { label: 'Mold', value: mold, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-900/30' },
  ];

  const flagStats = [
    { label: 'A/R Due', value: arPastDue, color: 'text-orange-400', dot: '#f97316' },
    { label: 'A/R Esc', value: arEscalated, color: 'text-red-400', dot: '#ef4444' },
    { label: 'Hazard', value: moldFlag, color: 'text-rose-400', dot: '#fb7185' },
    { label: 'Verify', value: needsVerify, color: 'text-yellow-400', dot: '#facc15' },
  ].filter(f => f.value > 0);

  return (
    <div className="flex items-center gap-3 px-2 py-2 overflow-x-auto">
      {stats.map(s => (
        <div key={s.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${s.bg} flex-shrink-0`}>
          <s.icon className={`w-4 h-4 ${s.color}`} />
          <span className="font-mono text-sm font-bold text-gray-200">{s.value}</span>
          <span className="text-xs text-gray-500">{s.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-900/30 flex-shrink-0">
        <span className="font-mono text-sm font-bold text-blue-400">{utilization}%</span>
        <span className="text-xs text-gray-500">Util</span>
      </div>

      {/* Flag breakdown */}
      {totalFlags > 0 && (
        <>
          <div className="w-px h-5 bg-gray-700 flex-shrink-0" />
          {flagStats.map(f => (
            <div key={f.label} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-800/50 flex-shrink-0">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.dot }} />
              <span className={`font-mono text-sm font-bold ${f.color}`}>{f.value}</span>
              <span className="text-xs text-gray-500">{f.label}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
