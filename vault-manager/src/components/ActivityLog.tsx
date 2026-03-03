import { X, Clock, ArrowRightLeft, Trash2, Edit3, Flag, MoveRight, Settings } from 'lucide-react';
import { useWarehouse } from '../contexts/WarehouseContext';

const actionIcons = {
  assign: MoveRight,
  unassign: Trash2,
  move: MoveRight,
  swap: ArrowRightLeft,
  edit: Edit3,
  flag: Flag,
  unflag: Flag,
  layout: Settings,
};

const actionColors = {
  assign: 'text-green-400',
  unassign: 'text-red-400',
  move: 'text-blue-400',
  swap: 'text-purple-400',
  edit: 'text-yellow-400',
  flag: 'text-red-400',
  unflag: 'text-gray-400',
  layout: 'text-cyan-400',
};

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ActivityLog() {
  const { showActivityLog, activityLog, dispatch } = useWarehouse();

  if (!showActivityLog) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-30 lg:hidden"
        onClick={() => dispatch({ type: 'TOGGLE_ACTIVITY_LOG' })}
      />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-gray-900 border-l border-gray-700 z-40 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-bold text-gray-100">Activity Log</h2>
          </div>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_ACTIVITY_LOG' })}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Log entries */}
        <div className="flex-1 overflow-y-auto">
          {activityLog.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-500 text-sm">
              No activity yet. Changes to vaults will appear here.
            </div>
          ) : (
            activityLog.map(entry => {
              const Icon = actionIcons[entry.action];
              const color = actionColors[entry.action];
              return (
                <div
                  key={entry.id}
                  className="flex gap-3 px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  <div className={`mt-0.5 flex-shrink-0 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200">{entry.details}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <span className="font-mono">#{entry.vaultNum}</span>
                      <span>&middot;</span>
                      <span>{entry.user}</span>
                      <span>&middot;</span>
                      <span>{timeAgo(entry.timestamp)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
