import type {
  DecisionAnalysis,
  InboxTriageItem,
  NoteItem,
  ProactiveSuggestion,
  ScheduleEvent,
  TaskItem,
} from '../types/libralix';

const PRIORITY_WEIGHT: Record<TaskItem['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const STATUS_WEIGHT: Record<TaskItem['status'], number> = {
  in_progress: 0,
  todo: 1,
  done: 2,
};

export function getTimestampMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'object' && ts !== null) {
    const maybe = ts as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === 'function') return maybe.toMillis();
    if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  }
  return 0;
}

export function sortByCreatedAtDesc<T extends { createdAt?: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
}

export function sortTasksByPriorityAndDue(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((a, b) => {
    const statusDiff = STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
    if (statusDiff !== 0) return statusDiff;

    const prioDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (prioDiff !== 0) return prioDiff;

    if (a.dueDate && b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseWorkHoursWindow(workHours: string): { startMin: number; endMin: number } {
  const match = workHours.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
  if (!match) {
    return { startMin: 9 * 60, endMin: 17 * 60 };
  }
  const startMin = timeToMinutes(match[1]);
  const endMin = timeToMinutes(match[2]);
  if (endMin <= startMin) {
    return { startMin: 9 * 60, endMin: 17 * 60 };
  }
  return { startMin, endMin };
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export function findFreeTimeSlots(
  events: ScheduleEvent[],
  date: string,
  workHours = '09:00 - 17:00',
  minSlotMinutes = 30
): TimeSlot[] {
  const { startMin, endMin } = parseWorkHoursWindow(workHours);
  const dayEvents = events
    .filter((ev) => ev.date === date)
    .map((ev) => ({
      start: timeToMinutes(ev.startTime),
      end: timeToMinutes(ev.endTime),
    }))
    .filter((ev) => ev.end > ev.start)
    .sort((a, b) => a.start - b.start);

  const slots: TimeSlot[] = [];
  let cursor = startMin;

  for (const ev of dayEvents) {
    if (ev.start > cursor) {
      const gapEnd = Math.min(ev.start, endMin);
      const duration = gapEnd - cursor;
      if (duration >= minSlotMinutes) {
        slots.push({
          startTime: minutesToTime(cursor),
          endTime: minutesToTime(gapEnd),
          durationMinutes: duration,
        });
      }
    }
    if (ev.end > cursor) {
      cursor = ev.end;
    }
    if (cursor >= endMin) break;
  }

  if (cursor < endMin) {
    const duration = endMin - cursor;
    if (duration >= minSlotMinutes) {
      slots.push({
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(endMin),
        durationMinutes: duration,
      });
    }
  }

  return slots;
}

export function filterNotesByQuery(notes: NoteItem[], query: string): NoteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter(
    (note) =>
      note.title.toLowerCase().includes(q) ||
      note.topic.toLowerCase().includes(q) ||
      note.content.toLowerCase().includes(q)
  );
}

export function buildProactiveInsights(params: {
  tasks: TaskItem[];
  events: ScheduleEvent[];
  triageItems: InboxTriageItem[];
  decisions: DecisionAnalysis[];
  todayDate: string;
}): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  const openTasks = params.tasks.filter((t) => t.status !== 'done');
  const highPriorityOpen = openTasks.filter((t) => t.priority === 'high');
  const todayEvents = params.events.filter((e) => e.date === params.todayDate);
  const urgentTriage = params.triageItems.filter(
    (item) => item.status === 'open' && item.priority === 'urgent'
  );
  const openDecisions = params.decisions.filter((d) => d.status === 'open');

  if (highPriorityOpen.length > 0 && todayEvents.length === 0) {
    suggestions.push({
      id: 'schedule-high-priority',
      title: `Block focus time for "${highPriorityOpen[0].title}"`,
      description: `You have ${highPriorityOpen.length} high-priority task${highPriorityOpen.length > 1 ? 's' : ''} and no events scheduled today.`,
      actionLabel: 'Open Schedule',
      targetTab: 'schedule',
    });
  }

  if (urgentTriage.length > 0) {
    suggestions.push({
      id: 'review-urgent-inbox',
      title: `${urgentTriage.length} urgent message${urgentTriage.length > 1 ? 's' : ''} awaiting reply`,
      description: `Latest: "${urgentTriage[0].subject}". Review the draft response and archive when done.`,
      actionLabel: 'Open Inbox Helper',
      targetTab: 'inbox',
    });
  }

  if (openDecisions.length > 0) {
    suggestions.push({
      id: 'finalize-decision',
      title: `Open decision: "${openDecisions[0].question}"`,
      description: 'Review the pros and cons compiled by libralix and finalize your choice.',
      actionLabel: 'Open Decisions',
      targetTab: 'decisions',
    });
  }

  return suggestions;
}

export function shouldRedirectToSignInOnTaskInput(
  isAuthenticated: boolean,
  inputValue: string
): boolean {
  return !isAuthenticated && inputValue.trim().length > 0;
}
