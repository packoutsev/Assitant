import type { TaskStatus, OrderStatus, DecisionStatus, PunchStatus } from '../types';

type AnyStatus = TaskStatus | OrderStatus | DecisionStatus | PunchStatus;

interface StatusBadgeProps {
  status: AnyStatus;
  small?: boolean;
}

const colorMap: Record<string, string> = {
  'Not Started': 'bg-gray-100 text-gray-600',
  'In Progress': 'bg-blue-50 text-blue-700',
  'Done': 'bg-sage-light text-sage',
  'Not Ordered': 'bg-amber-50 text-amber-700',
  'Ordered': 'bg-blue-50 text-blue-700',
  'Received': 'bg-sage-light text-sage',
  'TBD': 'bg-amber-50 text-amber-700',
  'Decided': 'bg-sage-light text-sage',
  'Open': 'bg-red-50 text-red-700',
  'Fixed': 'bg-sage-light text-sage',
};

export function StatusBadge({ status, small }: StatusBadgeProps) {
  const colors = colorMap[status] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${colors} ${
      small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
    }`}>
      {status}
    </span>
  );
}
