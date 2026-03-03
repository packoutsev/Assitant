import { useState } from 'react';
import { Settings, Clock, Users, Video } from 'lucide-react';
import { prepChecklist, scheduledMeetings, type PrepTask } from '../content/adminPrep';

const statusColors: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-amber/20 text-amber-800',
  done: 'bg-emerald-100 text-emerald-700',
};

const statusLabels: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  done: 'Done',
};

type PrepStatus = PrepTask['status'];
const statusCycle: PrepStatus[] = ['not_started', 'in_progress', 'done'];

export default function AdminView() {
  const [prepStatuses, setPrepStatuses] = useState<Record<string, PrepStatus>>(() => {
    const saved = localStorage.getItem('sdr_admin_prep');
    return saved ? JSON.parse(saved) : {};
  });

  function cycleStatus(taskId: string) {
    const current = prepStatuses[taskId] || 'not_started';
    const idx = statusCycle.indexOf(current);
    const next = statusCycle[(idx + 1) % statusCycle.length];
    const updated = { ...prepStatuses, [taskId]: next };
    setPrepStatuses(updated);
    localStorage.setItem('sdr_admin_prep', JSON.stringify(updated));
  }

  const categoryGroups = prepChecklist.reduce((acc, task) => {
    if (!acc[task.category]) acc[task.category] = [];
    acc[task.category].push(task);
    return acc;
  }, {} as Record<string, PrepTask[]>);

  const doneCount = prepChecklist.filter(t => (prepStatuses[t.id] || t.status) === 'done').length;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-6 h-6 text-navy" />
          <h1 className="text-xl font-bold text-navy">Admin — Pre-Launch Checklist</h1>
        </div>
        <p className="text-sm text-gray-500">
          Matt &amp; Aminta's prep tasks. Everything that must be done before March 9.
        </p>
        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${(doneCount / prepChecklist.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-500">{doneCount}/{prepChecklist.length} done</span>
        </div>
      </div>

      {Object.entries(categoryGroups).map(([category, tasks]) => (
        <div key={category} className="mb-6">
          <h2 className="text-sm font-bold text-navy mb-3 flex items-center gap-2">
            {category === 'Tool Setup' && <Settings className="w-4 h-4" />}
            {category === 'Scheduling' && <Clock className="w-4 h-4" />}
            {(category === 'Content' || category === 'Config') && <Users className="w-4 h-4" />}
            {category}
          </h2>
          <div className="space-y-2">
            {tasks.map(task => {
              const status = prepStatuses[task.id] || task.status;
              return (
                <div key={task.id} className={`bg-white rounded-xl border p-4 ${
                  status === 'done' ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200'
                }`}>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => cycleStatus(task.id)}
                      className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                        status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' :
                        status === 'in_progress' ? 'border-amber bg-amber/10' :
                        'border-gray-300 hover:border-navy'
                      }`}
                    >
                      {status === 'done' && <span className="text-xs font-bold">&#10003;</span>}
                      {status === 'in_progress' && <span className="text-amber text-[10px]">&#9679;</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-medium ${status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                          {task.task}
                        </p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusColors[status]}`}>
                          {statusLabels[status]}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <span className="text-[10px] font-medium text-gray-400">Owner: {task.owner}</span>
                        <span className="text-[10px] font-medium text-gray-400">By: {task.deadline}</span>
                        {task.blocksDay && (
                          <span className="text-[10px] font-medium text-red-400">Blocks {task.blocksDay}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">{task.details}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Scheduled Meetings */}
      <div className="mt-8 mb-4">
        <h2 className="text-lg font-bold text-navy mb-2 flex items-center gap-2">
          <Video className="w-5 h-5" />
          Scheduled Meetings
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Google Meet links for all live sessions. Create Calendar events and paste the Meet URLs into <code className="bg-gray-100 px-1 rounded text-xs">src/content/adminPrep.ts</code>, then redeploy.
        </p>
        <div className="space-y-2">
          {scheduledMeetings.map(meeting => (
            <div key={meeting.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{meeting.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {meeting.date} &middot; {meeting.time} &middot; {meeting.duration}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {meeting.participants.join(', ')}
                  </p>
                  {meeting.notes && (
                    <p className="text-xs text-gray-500 mt-2">{meeting.notes}</p>
                  )}
                </div>
                {meeting.meetLink ? (
                  <a
                    href={meeting.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-xs font-medium rounded-lg hover:bg-emerald-600 transition-colors shrink-0"
                  >
                    <Video className="w-3 h-3" />
                    Join
                  </a>
                ) : (
                  <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded shrink-0">
                    No link yet
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
