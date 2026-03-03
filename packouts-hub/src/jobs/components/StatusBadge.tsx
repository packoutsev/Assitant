const STATUS_STYLES: Record<string, string> = {
  new: 'bg-amber-50 text-amber-700',
  planning: 'bg-blue-50 text-blue-700',
  sales: 'bg-blue-50 text-blue-700',
  packout: 'bg-emerald-50 text-emerald-700',
  storage: 'bg-violet-50 text-violet-700',
  packback: 'bg-sky-50 text-sky-700',
  'final invoice': 'bg-gray-100 text-gray-600',
  receivables: 'bg-orange-50 text-orange-700',
  'paid in full': 'bg-emerald-50 text-emerald-700',
  'on hold': 'bg-red-50 text-red-600',
};

export default function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const style = STATUS_STYLES[key] || 'bg-gray-100 text-gray-600';

  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${style}`}>
      {status}
    </span>
  );
}
