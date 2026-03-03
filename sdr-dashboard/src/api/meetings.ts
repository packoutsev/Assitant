// Matches daily tasks to scheduled meetings for "Join Meeting" buttons in task cards

import { scheduledMeetings } from '../content/adminPrep';

const monthMap: Record<string, string> = {
  January: '1', February: '2', March: '3', April: '4',
  May: '5', June: '6', July: '7', August: '8',
  September: '9', October: '10', November: '11', December: '12',
};

function parseMeetingDate(dateStr: string): string | null {
  const monthName = dateStr.match(/January|February|March|April|May|June|July|August|September|October|November|December/)?.[0];
  const day = dateStr.match(/\d+/)?.[0];
  if (!monthName || !day) return null;
  return `${monthMap[monthName]}/${day}`;
}

function parseTaskDate(dayStr: string): string | null {
  const match = dayStr.match(/(\d+)\/(\d+)/);
  if (!match) return null;
  return `${parseInt(match[1])}/${parseInt(match[2])}`;
}

export interface MeetingInfo {
  title: string;
  time: string;
  duration: string;
  meetLink: string;
}

export function getMeetingForTask(taskDay: string, taskText: string): MeetingInfo | null {
  const taskDate = parseTaskDate(taskDay);
  if (!taskDate) return null;

  const taskLower = taskText.toLowerCase();

  for (const meeting of scheduledMeetings) {
    const meetDate = parseMeetingDate(meeting.date);
    if (meetDate !== taskDate) continue;
    if (!meeting.meetLink) continue;

    // Keyword matching between task text and meeting title
    const meetWords = meeting.title.toLowerCase().split(/[\s—\-:]+/).filter(w => w.length > 3);
    const hasKeywordOverlap = meetWords.some(w => taskLower.includes(w));

    // Participant name matching
    const hasParticipantOverlap = meeting.participants.some(
      p => p.length > 3 && taskLower.includes(p.toLowerCase())
    );

    if (hasKeywordOverlap || hasParticipantOverlap) {
      return {
        title: meeting.title,
        time: meeting.time,
        duration: meeting.duration,
        meetLink: meeting.meetLink,
      };
    }
  }

  return null;
}
