import type { TaskStatus } from '../types';

const statusStyles: Record<TaskStatus, string> = {
  'Not Started': 'bg-gray-100 text-gray-600',
  'In Progress': 'bg-amber-50 text-amber-700 border border-amber-200',
  'Done': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'Blocked': 'bg-red-50 text-red-700 border border-red-200',
};

interface StatusBadgeProps {
  status: TaskStatus;
  small?: boolean;
}

export default function StatusBadge({ status, small }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${statusStyles[status] || statusStyles['Not Started']} ${
      small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
    }`}>
      {status === 'Done' && <span className="mr-1">&#10003;</span>}
      {status}
    </span>
  );
}
