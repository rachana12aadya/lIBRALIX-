import type { EventCategory, TaskPriority, TriagePriority, UserProfile } from '../types/libralix';
import type { TimeSlot } from '../utils/planner';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  let parsed: ({ error?: string } & Partial<T>) | null = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as { error?: string } & Partial<T>;
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) {
    throw new Error(parsed?.error || `Request failed (${res.status})`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Unexpected response received from the assistant server. Please try again.');
  }
  return parsed as T;
}

export async function runAutonomousResearch(params: {
  query: string;
  userContext?: UserProfile | null;
}): Promise<{
  query: string;
  summary: string;
  keyFindings: string[];
  sources: string[];
}> {
  const data = await postJson<{
    query?: string;
    summary?: string;
    keyFindings?: string[];
    sources?: string[];
  }>('/api/agent/research', params);
  return {
    query: typeof data.query === 'string' && data.query.trim() ? data.query : params.query,
    summary:
      typeof data.summary === 'string' && data.summary.trim()
        ? data.summary
        : 'No research output was returned.',
    keyFindings: Array.isArray(data.keyFindings)
      ? data.keyFindings.filter((item): item is string => typeof item === 'string')
      : [],
    sources: Array.isArray(data.sources)
      ? data.sources.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export async function planTasksFromGoal(params: {
  goal: string;
  existingTasks: string[];
  userContext?: UserProfile | null;
}): Promise<{
  tasks: Array<{ title: string; priority: TaskPriority; notes: string }>;
}> {
  const data = await postJson<{
    tasks?: Array<{ title?: string; priority?: string; notes?: string }>;
  }>('/api/agent/plan-tasks', params);
  return {
    tasks: Array.isArray(data.tasks)
      ? data.tasks
          .filter((t) => typeof t?.title === 'string' && t.title.trim().length > 0)
          .map((t) => ({
            title: String(t.title),
            priority:
              t.priority === 'high' || t.priority === 'low' ? t.priority : ('medium' as TaskPriority),
            notes: typeof t.notes === 'string' ? t.notes : '',
          }))
      : [],
  };
}

export async function triageEmailMessage(params: {
  sender: string;
  subject: string;
  body: string;
  userContext?: UserProfile | null;
}): Promise<{
  summary: string;
  priority: TriagePriority;
  suggestedReply: string;
  extractedTasks: Array<{ title: string; priority: TaskPriority }>;
}> {
  const data = await postJson<{
    summary?: string;
    priority?: string;
    suggestedReply?: string;
    extractedTasks?: Array<{ title?: string; priority?: string }>;
  }>('/api/agent/triage-email', params);
  return {
    summary:
      typeof data.summary === 'string' && data.summary.trim()
        ? data.summary
        : 'Summary unavailable.',
    priority:
      data.priority === 'urgent' || data.priority === 'low' ? data.priority : 'normal',
    suggestedReply: typeof data.suggestedReply === 'string' ? data.suggestedReply : '',
    extractedTasks: Array.isArray(data.extractedTasks)
      ? data.extractedTasks
          .filter((t) => typeof t?.title === 'string' && t.title.trim().length > 0)
          .map((t) => ({
            title: String(t.title),
            priority:
              t.priority === 'high' || t.priority === 'low' ? t.priority : ('medium' as TaskPriority),
          }))
      : [],
  };
}

export async function analyzeDecision(params: {
  question: string;
  context: string;
  userContext?: UserProfile | null;
}): Promise<{
  question: string;
  pros: string[];
  cons: string[];
  recommendation: string;
}> {
  const data = await postJson<{
    question?: string;
    pros?: string[];
    cons?: string[];
    recommendation?: string;
  }>('/api/agent/decide', params);
  return {
    question:
      typeof data.question === 'string' && data.question.trim() ? data.question : params.question,
    pros: Array.isArray(data.pros)
      ? data.pros.filter((item): item is string => typeof item === 'string')
      : [],
    cons: Array.isArray(data.cons)
      ? data.cons.filter((item): item is string => typeof item === 'string')
      : [],
    recommendation:
      typeof data.recommendation === 'string' && data.recommendation.trim()
        ? data.recommendation
        : 'Weigh the highest-impact trade-offs before deciding.',
  };
}

export async function suggestScheduleBlocks(params: {
  date: string;
  freeSlots: TimeSlot[];
  pendingTasks: Array<{ title: string; priority: TaskPriority }>;
  userContext?: UserProfile | null;
}): Promise<{
  suggestions: Array<{
    title: string;
    startTime: string;
    endTime: string;
    category: EventCategory;
    reason: string;
  }>;
}> {
  const data = await postJson<{
    suggestions?: Array<{
      title?: string;
      startTime?: string;
      endTime?: string;
      category?: string;
      reason?: string;
    }>;
  }>('/api/agent/schedule-suggest', params);
  return {
    suggestions: Array.isArray(data.suggestions)
      ? data.suggestions
          .filter((s) => typeof s?.title === 'string' && s.title.trim().length > 0)
          .map((s) => ({
            title: String(s.title),
            startTime: typeof s.startTime === 'string' ? s.startTime : '09:00',
            endTime: typeof s.endTime === 'string' ? s.endTime : '10:00',
            category:
              s.category === 'meeting' || s.category === 'personal' || s.category === 'review'
                ? s.category
                : ('deep_work' as EventCategory),
            reason: typeof s.reason === 'string' ? s.reason : '',
          }))
      : [],
  };
}

export async function synthesizeUserMemory(params: {
  recentActivity: string;
  currentMemory: string;
}): Promise<{ learnedContext: string }> {
  const data = await postJson<{ learnedContext?: string }>('/api/agent/update-memory', params);
  return {
    learnedContext:
      typeof data.learnedContext === 'string' ? data.learnedContext : params.currentMemory,
  };
}

export async function testToolWebhookSync(params: {
  toolName: string;
  endpointUrl: string;
}): Promise<{ ok: boolean; status: number }> {
  return postJson('/api/agent/webhook-sync', params);
}

export interface GmailInboxMessage {
  id: string;
  threadId: string;
  messageIdHeader: string;
  sender: string;
  senderEmail: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}

export async function fetchGmailMessages(accessToken: string): Promise<GmailInboxMessage[]> {
  const res = await fetch('/api/gmail/messages', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const rawText = await res.text();
  let parsed: { error?: string; messages?: GmailInboxMessage[] } | null = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as { error?: string; messages?: GmailInboxMessage[] };
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) {
    throw new Error(parsed?.error || `Failed to load Gmail messages (${res.status})`);
  }
  return Array.isArray(parsed?.messages) ? parsed.messages : [];
}

export async function sendGmailReply(
  accessToken: string,
  params: {
    to: string;
    subject: string;
    body: string;
    threadId?: string;
    inReplyTo?: string;
  }
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch('/api/gmail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  const rawText = await res.text();
  let parsed: { error?: string; ok?: boolean; id?: string } | null = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as { error?: string; ok?: boolean; id?: string };
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) {
    throw new Error(parsed?.error || `Failed to send Gmail reply (${res.status})`);
  }
  return { ok: Boolean(parsed?.ok), id: parsed?.id || '' };
}

export type WhatsAppQrStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'error';

export interface WhatsAppInboxMessage {
  id: string;
  fromPhone: string;
  fromJid?: string;
  senderName: string;
  body: string;
  timestamp: string;
}

export interface WhatsAppQrSessionResponse {
  status: WhatsAppQrStatus;
  qrDataUrl: string | null;
  connectedPhone: string;
  connectedName: string;
  error: string | null;
}

export async function getWhatsAppInbox(): Promise<{
  configured: boolean;
  qrStatus: WhatsAppQrStatus;
  qrDataUrl: string | null;
  connectedPhone: string;
  connectedName: string;
  error: string | null;
  messages: WhatsAppInboxMessage[];
}> {
  const res = await fetch('/api/whatsapp/inbox');
  const rawText = await res.text();
  interface WhatsAppInboxResponse {
    error?: string | null;
    configured?: boolean;
    qrStatus?: WhatsAppQrStatus;
    qrDataUrl?: string | null;
    connectedPhone?: string;
    connectedName?: string;
    messages?: WhatsAppInboxMessage[];
  }
  let parsed: WhatsAppInboxResponse | null = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as WhatsAppInboxResponse;
    } catch {
      parsed = null;
    }
  }
  if (!res.ok || !parsed) {
    throw new Error(parsed?.error || 'Failed to read WhatsApp inbox status.');
  }
  return {
    configured: Boolean(parsed.configured),
    qrStatus: parsed.qrStatus || 'disconnected',
    qrDataUrl: typeof parsed.qrDataUrl === 'string' ? parsed.qrDataUrl : null,
    connectedPhone: typeof parsed.connectedPhone === 'string' ? parsed.connectedPhone : '',
    connectedName: typeof parsed.connectedName === 'string' ? parsed.connectedName : '',
    error: typeof parsed.error === 'string' ? parsed.error : null,
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
  };
}

export async function startWhatsAppQr(forceRefresh = false): Promise<WhatsAppQrSessionResponse> {
  return postJson('/api/whatsapp/qr/start', { forceRefresh });
}

export async function disconnectWhatsAppQr(): Promise<WhatsAppQrSessionResponse> {
  return postJson('/api/whatsapp/qr/disconnect', {});
}

export async function sendWhatsAppReply(params: {
  to: string;
  jid?: string;
  body: string;
}): Promise<{ ok: boolean; id: string }> {
  return postJson('/api/whatsapp/send', params);
}
