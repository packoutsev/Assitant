import { ChevronDown, ExternalLink, Play, FileText, Wrench, Video } from 'lucide-react';
import { useState } from 'react';
import type { DailyTask, TaskStatus } from '../types';
import type { ViewId } from './Layout';
import StatusBadge from './StatusBadge';
import { extractLinks } from '../api/links';
import { getMeetingForTask } from '../api/meetings';

const categoryColors: Record<string, string> = {
  'Sagan Async': 'bg-purple-100 text-purple-700',
  'Sagan Live': 'bg-purple-200 text-purple-800',
  'Playbook': 'bg-blue-100 text-blue-700',
  'Onboarding': 'bg-navy/10 text-navy',
  'Setup': 'bg-teal-100 text-teal-700',
  'Industry Education': 'bg-orange-100 text-orange-700',
  'Live Calls': 'bg-green-100 text-green-700',
  'Training': 'bg-indigo-100 text-indigo-700',
  'Role-Play': 'bg-pink-100 text-pink-700',
  'Fire Leads': 'bg-red-100 text-red-700',
  'Prospecting': 'bg-cyan-100 text-cyan-700',
  'Reporting': 'bg-amber/20 text-amber-800',
  'QA': 'bg-gray-100 text-gray-700',
};

const statusCycle: TaskStatus[] = ['Not Started', 'In Progress', 'Done'];

const linkIcons = {
  external: ExternalLink,
  play: Play,
  form: FileText,
  tool: Wrench,
};

interface TaskCardProps {
  task: DailyTask;
  onStatusChange: (task: DailyTask, newStatus: TaskStatus) => void;
  onNavigate?: (view: ViewId) => void;
  stepNumber?: number;
  isNext?: boolean;
}

export default function TaskCard({ task, onStatusChange, onNavigate, stepNumber, isNext }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const links = extractLinks(task.Task, task.Notes);
  const meeting = getMeetingForTask(task.Day, task.Task);

  function cycleStatus() {
    const currentIdx = statusCycle.indexOf(task.Status);
    const nextIdx = (currentIdx + 1) % statusCycle.length;
    onStatusChange(task, statusCycle[nextIdx]);
  }

  function handleLinkClick(e: React.MouseEvent, url: string) {
    if (url.startsWith('#view:') && onNavigate) {
      e.preventDefault();
      onNavigate(url.replace('#view:', '') as ViewId);
    }
  }

  const isDone = task.Status === 'Done';
  const isInProgress = task.Status === 'In Progress';

  return (
    <div className={`bg-white rounded-xl border transition-all ${
      isNext
        ? 'border-amber ring-2 ring-amber/30 shadow-md'
        : isDone
          ? 'border-emerald-200 bg-emerald-50/30'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
    }`}>
      {isNext && (
        <div className="bg-amber text-navy text-xs font-bold px-4 py-1.5 rounded-t-xl flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-navy/40"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-navy"></span>
          </span>
          START HERE — Click the circle to begin this task
        </div>
      )}

      <div className="flex items-start gap-3 p-4">
        <div className="flex flex-col items-center gap-1 shrink-0">
          {stepNumber && (
            <span className={`text-[10px] font-bold ${isDone ? 'text-emerald-400' : 'text-gray-300'}`}>
              {stepNumber}
            </span>
          )}
          <button
            onClick={cycleStatus}
            className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
              isDone
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : isInProgress
                  ? 'border-amber bg-amber/10 hover:bg-amber/20'
                  : isNext
                    ? 'border-amber hover:bg-amber/10 animate-pulse'
                    : 'border-gray-300 hover:border-navy hover:bg-navy/5'
            }`}
            title={
              isDone ? 'Click to reopen' :
              isInProgress ? 'Click to mark done' :
              'Click to start this task'
            }
          >
            {isDone && <span className="text-sm font-bold">&#10003;</span>}
            {isInProgress && <span className="text-amber text-xs font-bold">&#9679;</span>}
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {task.Task}
            </p>
            <StatusBadge status={task.Status} small />
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${categoryColors[task.Category] || 'bg-gray-100 text-gray-600'}`}>
              {task.Category}
            </span>
            {task.Owner !== 'Vanessa' && (
              <span className="text-[10px] text-gray-400 font-medium">
                {task.Owner === 'Both' ? 'With Matt' : task.Owner}
              </span>
            )}
          </div>

          {/* Action links + Meet link */}
          {!isDone && (links.length > 0 || meeting) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {meeting && (
                <a
                  href={meeting.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Video className="w-3 h-3" />
                  Join Meeting ({meeting.time})
                </a>
              )}
              {links.map((link, i) => {
                const Icon = linkIcons[link.icon || 'external'];
                const isInApp = link.url.startsWith('#view:');
                return (
                  <a
                    key={i}
                    href={isInApp ? '#' : link.url}
                    target={isInApp ? undefined : '_blank'}
                    rel={isInApp ? undefined : 'noopener noreferrer'}
                    onClick={(e) => handleLinkClick(e, link.url)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-navy/5 hover:bg-navy/10 text-navy text-xs font-medium rounded-lg transition-colors border border-navy/10"
                  >
                    <Icon className="w-3 h-3" />
                    {link.label}
                  </a>
                );
              })}
            </div>
          )}

          {task.Notes && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                {expanded ? 'Hide details' : 'Show details'}
              </button>
              {expanded && (
                <p className="text-xs text-gray-500 mt-1 pl-4 border-l-2 border-gray-200">
                  {task.Notes}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
