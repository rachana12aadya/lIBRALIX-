import type {
  DecisionStatus,
  EventCategory,
  TaskPriority,
  TaskSource,
  TaskStatus,
  ToolType,
  TriagePriority,
  TriageStatus,
} from '../types/libralix.ts';

// Synchronized verbatim with firebase-blueprint.json
export const BLUEPRINT_LIMITS = {
  idPattern: /^[a-zA-Z0-9_-]+$/,
  datePattern: /^\d{4}-\d{2}-\d{2}$/,
  timePattern: /^\d{2}:\d{2}$/,
  uidMax: 128,
  displayNameMax: 120,
  roleMax: 120,
  workHoursMax: 80,
  focusPreferencesMax: 500,
  ongoingProjectsMax: 1000,
  learnedContextMax: 1500,
  emailMax: 254,
  taskTitleMax: 200,
  taskNotesMax: 1500,
  dueDateMax: 20,
  researchQueryMax: 500,
  researchSummaryMax: 6000,
  researchFindingsMaxItems: 10,
  researchFindingItemMax: 400,
  researchSourcesMaxItems: 15,
  researchSourceItemMax: 500,
  eventTitleMax: 200,
  eventNotesMax: 1000,
  noteTitleMax: 200,
  noteContentMax: 8000,
  noteTopicMax: 80,
  decisionQuestionMax: 400,
  decisionListMaxItems: 12,
  decisionItemMax: 400,
  decisionRecommendationMax: 3000,
  triageSenderMax: 160,
  triageSubjectMax: 200,
  triageSnippetMax: 4000,
  triageSummaryMax: 2000,
  triageReplyMax: 3000,
  toolNameMax: 100,
  endpointUrlMax: 500,
  toolNotesMax: 500,
} as const;

export const ALLOWED_TASK_PRIORITIES: readonly TaskPriority[] = ['high', 'medium', 'low'];
export const ALLOWED_TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done'];
export const ALLOWED_TASK_SOURCES: readonly TaskSource[] = ['manual', 'email', 'research', 'agent'];
export const ALLOWED_EVENT_CATEGORIES: readonly EventCategory[] = [
  'deep_work',
  'meeting',
  'personal',
  'review',
];
export const ALLOWED_DECISION_STATUSES: readonly DecisionStatus[] = ['open', 'decided'];
export const ALLOWED_TRIAGE_PRIORITIES: readonly TriagePriority[] = ['urgent', 'normal', 'low'];
export const ALLOWED_TRIAGE_STATUSES: readonly TriageStatus[] = ['open', 'archived'];
export const ALLOWED_TOOL_TYPES: readonly ToolType[] = [
  'calendar',
  'project_management',
  'email',
  'webhook',
];

export function clampString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

export function clampStringArray(
  value: unknown,
  maxItems: number,
  maxItemLen: number
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clampString(item, maxItemLen))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

export function isValidId(id: string): boolean {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= BLUEPRINT_LIMITS.uidMax &&
    BLUEPRINT_LIMITS.idPattern.test(id)
  );
}

export function generateSafeId(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'item';
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${safePrefix}_${rand}`;
}

export function validateTaskInput(input: {
  title: string;
  notes?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  source?: string;
}): { ok: true; data: { title: string; notes: string; priority: TaskPriority; status: TaskStatus; dueDate: string; source: TaskSource } } | { ok: false; error: string } {
  const title = clampString(input.title, BLUEPRINT_LIMITS.taskTitleMax);
  if (!title) {
    return { ok: false, error: 'Please enter a task title.' };
  }
  const notes = clampString(input.notes ?? '', BLUEPRINT_LIMITS.taskNotesMax);
  const priority = ALLOWED_TASK_PRIORITIES.includes(input.priority as TaskPriority)
    ? (input.priority as TaskPriority)
    : 'medium';
  const status = ALLOWED_TASK_STATUSES.includes(input.status as TaskStatus)
    ? (input.status as TaskStatus)
    : 'todo';
  const dueDate = clampString(input.dueDate ?? '', BLUEPRINT_LIMITS.dueDateMax);
  if (dueDate && !BLUEPRINT_LIMITS.datePattern.test(dueDate)) {
    return { ok: false, error: 'Due date must be in YYYY-MM-DD format.' };
  }
  const source = ALLOWED_TASK_SOURCES.includes(input.source as TaskSource)
    ? (input.source as TaskSource)
    : 'manual';

  return { ok: true, data: { title, notes, priority, status, dueDate, source } };
}

export function validateEventInput(input: {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  category?: string;
  notes?: string;
}): {
  ok: true;
  data: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    category: EventCategory;
    notes: string;
  };
} | { ok: false; error: string } {
  const title = clampString(input.title, BLUEPRINT_LIMITS.eventTitleMax);
  if (!title) return { ok: false, error: 'Please enter an event title.' };

  const date = clampString(input.date, 10);
  if (!BLUEPRINT_LIMITS.datePattern.test(date)) {
    return { ok: false, error: 'Please choose a valid date (YYYY-MM-DD).' };
  }

  const startTime = clampString(input.startTime, 5);
  const endTime = clampString(input.endTime, 5);
  if (!BLUEPRINT_LIMITS.timePattern.test(startTime) || !BLUEPRINT_LIMITS.timePattern.test(endTime)) {
    return { ok: false, error: 'Start and end times must be in HH:MM format.' };
  }
  if (endTime <= startTime) {
    return { ok: false, error: 'End time must be after start time.' };
  }

  const category = ALLOWED_EVENT_CATEGORIES.includes(input.category as EventCategory)
    ? (input.category as EventCategory)
    : 'deep_work';
  const notes = clampString(input.notes ?? '', BLUEPRINT_LIMITS.eventNotesMax);

  return { ok: true, data: { title, date, startTime, endTime, category, notes } };
}

export function validateNoteInput(input: {
  title: string;
  content: string;
  topic?: string;
}): { ok: true; data: { title: string; content: string; topic: string } } | { ok: false; error: string } {
  const title = clampString(input.title, BLUEPRINT_LIMITS.noteTitleMax);
  const content = clampString(input.content, BLUEPRINT_LIMITS.noteContentMax);
  const topic = clampString(input.topic ?? '', BLUEPRINT_LIMITS.noteTopicMax);
  if (!title) return { ok: false, error: 'Please enter a note title.' };
  if (!content) return { ok: false, error: 'Please enter note content.' };
  return { ok: true, data: { title, content, topic } };
}

export function validateToolInput(input: {
  toolName: string;
  toolType: string;
  endpointUrl?: string;
  syncEnabled?: boolean;
  notes?: string;
}): {
  ok: true;
  data: {
    toolName: string;
    toolType: ToolType;
    endpointUrl: string;
    syncEnabled: boolean;
    notes: string;
  };
} | { ok: false; error: string } {
  const toolName = clampString(input.toolName, BLUEPRINT_LIMITS.toolNameMax);
  if (!toolName) return { ok: false, error: 'Please enter a tool name.' };
  const toolType = ALLOWED_TOOL_TYPES.includes(input.toolType as ToolType)
    ? (input.toolType as ToolType)
    : 'webhook';
  const endpointUrl = clampString(input.endpointUrl ?? '', BLUEPRINT_LIMITS.endpointUrlMax);
  if (endpointUrl && !/^https?:\/\/.+/i.test(endpointUrl)) {
    return { ok: false, error: 'Endpoint URL must start with http:// or https://.' };
  }
  const syncEnabled = Boolean(input.syncEnabled);
  const notes = clampString(input.notes ?? '', BLUEPRINT_LIMITS.toolNotesMax);
  return { ok: true, data: { toolName, toolType, endpointUrl, syncEnabled, notes } };
}
