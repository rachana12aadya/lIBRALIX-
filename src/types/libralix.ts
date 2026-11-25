export type WorkspaceTab =
  | 'overview'
  | 'tasks'
  | 'research'
  | 'schedule'
  | 'inbox'
  | 'notes'
  | 'decisions'
  | 'profile';

export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskSource = 'manual' | 'email' | 'research' | 'agent';

export interface UserProfile {
  uid: string;
  displayName: string;
  role: string;
  workHours: string;
  focusPreferences: string;
  ongoingProjects: string;
  learnedContext: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TaskItem {
  id: string;
  uid: string;
  title: string;
  notes: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  source: TaskSource;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ResearchBrief {
  id: string;
  uid: string;
  query: string;
  summary: string;
  keyFindings: string[];
  sources: string[]; // Formatted as "Title || https://..."
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type EventCategory = 'deep_work' | 'meeting' | 'personal' | 'review';

export interface ScheduleEvent {
  id: string;
  uid: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  category: EventCategory;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NoteItem {
  id: string;
  uid: string;
  title: string;
  content: string;
  topic: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type DecisionStatus = 'open' | 'decided';

export interface DecisionAnalysis {
  id: string;
  uid: string;
  question: string;
  pros: string[];
  cons: string[];
  recommendation: string;
  status: DecisionStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TriagePriority = 'urgent' | 'normal' | 'low';
export type TriageStatus = 'open' | 'archived';

export interface InboxTriageItem {
  id: string;
  uid: string;
  sender: string;
  subject: string;
  originalSnippet: string;
  summary: string;
  suggestedReply: string;
  priority: TriagePriority;
  status: TriageStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ToolType = 'calendar' | 'project_management' | 'email' | 'webhook';

export interface ToolIntegration {
  id: string;
  uid: string;
  toolName: string;
  toolType: ToolType;
  endpointUrl: string;
  syncEnabled: boolean;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProactiveSuggestion {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  targetTab: WorkspaceTab;
}
