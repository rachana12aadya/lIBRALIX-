import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import { formatSourceEntry, parseResearchMarkdown } from './src/utils/researchParser.ts';
import { BLUEPRINT_LIMITS, clampString, clampStringArray } from './src/utils/validation.ts';
import {
  disconnectWhatsAppQrSession,
  getWhatsAppQrMessages,
  getWhatsAppSessionState,
  sendWhatsAppViaQrSession,
  startWhatsAppQrSession,
} from './src/utils/whatsappSession.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_ID = 'gemini-4-hydrogen';

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check the Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatUserContextBlock(userContext?: {
  displayName?: string;
  role?: string;
  workHours?: string;
  focusPreferences?: string;
  ongoingProjects?: string;
  learnedContext?: string;
}): string {
  if (!userContext) return '';
  const parts: string[] = [];
  if (userContext.displayName) parts.push(`Name: ${userContext.displayName}`);
  if (userContext.role) parts.push(`Role: ${userContext.role}`);
  if (userContext.workHours) parts.push(`Work Hours: ${userContext.workHours}`);
  if (userContext.focusPreferences) parts.push(`Focus Preferences: ${userContext.focusPreferences}`);
  if (userContext.ongoingProjects) parts.push(`Ongoing Projects: ${userContext.ongoingProjects}`);
  if (userContext.learnedContext) parts.push(`Learned Context: ${userContext.learnedContext}`);
  return parts.length > 0 ? `\nUser Profile & Memory:\n${parts.join('\n')}\n` : '';
}

function getApiErrorMessage(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GEMINI_API_KEY')) {
    return { status: 503, message: raw };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      message: 'The Gemini API key appears invalid or lacks permission. Please verify it in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'API rate limit reached. Please wait a moment and try again.',
    };
  }
  return { status: 500, message: raw || 'Unexpected error communicating with the assistant.' };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'libralix' });
  });

  app.get('/api/presentation-pdf', (req, res) => {
    const candidates = [
      path.resolve(__dirname, 'docs', 'libralix_class_presentation.pdf'),
      path.resolve(__dirname, 'public', 'libralix_class_presentation.pdf'),
      path.resolve(__dirname, 'dist', 'libralix_class_presentation.pdf'),
    ];
    const pdfPath = candidates.find((p) => fs.existsSync(p));
    if (!pdfPath) {
      res.status(404).json({ error: 'Presentation PDF not found.' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    const isDownload = req.query.download === '1' || req.query.download === 'true';
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="libralix_class_presentation.pdf"`
    );
    res.sendFile(pdfPath);
  });

  // 1. Autonomous Research with Google Search Grounding
  app.post('/api/agent/research', async (req, res) => {
    try {
      const query = clampString(req.body?.query, BLUEPRINT_LIMITS.researchQueryMax);
      if (!query) {
        res.status(400).json({ error: 'Please enter a research question or topic.' });
        return;
      }

      const ai = getGenAIClient();
      const contextBlock = formatUserContextBlock(req.body?.userContext);

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `${contextBlock}Research Request: ${query}

Conduct thorough web research, filter out noise, and synthesize clear, accurate insights in simple language.
Format your response with exactly these two markdown headings:

## Summary
Write a clear, concise 2-4 paragraph executive brief directly answering the research request.

## Key Findings
- Bullet point 1
- Bullet point 2
- Bullet point 3
- (3 to 7 crisp, factual takeaways)`,
        config: {
          systemInstruction:
            'You are libralix, a personal research assistant. Be clear, factual, concise, and avoid buzzwords or filler.',
          tools: [{ googleSearch: {} }],
        },
      });

      const parsed = parseResearchMarkdown(response.text ?? '');
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const seenUrls = new Set<string>();
      const sources: string[] = [];

      for (const chunk of chunks) {
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title;
        if (uri && !seenUrls.has(uri)) {
          seenUrls.add(uri);
          const formatted = formatSourceEntry(title || uri, uri);
          if (formatted) sources.push(formatted);
        }
        if (sources.length >= BLUEPRINT_LIMITS.researchSourcesMaxItems) break;
      }

      res.json({
        query,
        summary: parsed.summary,
        keyFindings: parsed.keyFindings,
        sources,
      });
    } catch (err) {
      const { status, message } = getApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // 2. Break Down Goal / Plan Tasks
  app.post('/api/agent/plan-tasks', async (req, res) => {
    try {
      const goal = clampString(req.body?.goal, 400);
      if (!goal) {
        res.status(400).json({ error: 'Please describe the goal or project to break down.' });
        return;
      }

      const ai = getGenAIClient();
      const contextBlock = formatUserContextBlock(req.body?.userContext);
      const existingTitles = Array.isArray(req.body?.existingTasks)
        ? req.body.existingTasks.slice(0, 15).join('; ')
        : '';

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `${contextBlock}Existing open tasks: ${existingTitles || 'None'}
Goal to break down: ${goal}

Create 3 to 5 clear, actionable tasks with realistic priorities so the user can execute immediately.`,
        config: {
          systemInstruction:
            'You are libralix, a personal productivity assistant. Keep task titles short, clear, and action-oriented.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
                    notes: { type: Type.STRING },
                  },
                  required: ['title', 'priority', 'notes'],
                },
              },
            },
            required: ['tasks'],
          },
        },
      });

      const data = JSON.parse((response.text ?? '{"tasks":[]}').trim()) as {
        tasks?: Array<{ title?: string; priority?: string; notes?: string }>;
      };
      const tasks = (data.tasks ?? []).slice(0, 6).map((t) => ({
        title: clampString(t.title, BLUEPRINT_LIMITS.taskTitleMax),
        priority: t.priority === 'high' || t.priority === 'low' ? t.priority : 'medium',
        notes: clampString(t.notes, BLUEPRINT_LIMITS.taskNotesMax),
      })).filter((t) => t.title.length > 0);

      res.json({ tasks });
    } catch (err) {
      const { status, message } = getApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // 3. Email & Message Triage
  app.post('/api/agent/triage-email', async (req, res) => {
    try {
      const sender = clampString(req.body?.sender ?? '', BLUEPRINT_LIMITS.triageSenderMax);
      const subject = clampString(req.body?.subject ?? '', BLUEPRINT_LIMITS.triageSubjectMax);
      const body = clampString(req.body?.body ?? '', BLUEPRINT_LIMITS.triageSnippetMax);

      if (!subject || !body) {
        res.status(400).json({ error: 'Please provide both a subject and message content.' });
        return;
      }

      const ai = getGenAIClient();
      const contextBlock = formatUserContextBlock(req.body?.userContext);

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `${contextBlock}From: ${sender || 'Unknown'}
Subject: ${subject}
Message:
${body}

Summarize the message, assess urgency, draft a polite and clear reply, and list any concrete action tasks.`,
        config: {
          systemInstruction:
            'You are libralix, an executive inbox assistant. Be concise, polite, and practical.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              priority: { type: Type.STRING, enum: ['urgent', 'normal', 'low'] },
              suggestedReply: { type: Type.STRING },
              extractedTasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
                  },
                  required: ['title', 'priority'],
                },
              },
            },
            required: ['summary', 'priority', 'suggestedReply', 'extractedTasks'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        summary?: string;
        priority?: string;
        suggestedReply?: string;
        extractedTasks?: Array<{ title?: string; priority?: string }>;
      };

      res.json({
        summary:
          clampString(parsed.summary, BLUEPRINT_LIMITS.triageSummaryMax) ||
          'Summary unavailable.',
        priority:
          parsed.priority === 'urgent' || parsed.priority === 'low' ? parsed.priority : 'normal',
        suggestedReply: clampString(parsed.suggestedReply ?? '', BLUEPRINT_LIMITS.triageReplyMax),
        extractedTasks: (parsed.extractedTasks ?? [])
          .slice(0, 5)
          .map((t) => ({
            title: clampString(t.title, BLUEPRINT_LIMITS.taskTitleMax),
            priority: t.priority === 'high' || t.priority === 'low' ? t.priority : 'medium',
          }))
          .filter((t) => t.title.length > 0),
      });
    } catch (err) {
      const { status, message } = getApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // 4. Decision Support (Pros & Cons)
  app.post('/api/agent/decide', async (req, res) => {
    try {
      const question = clampString(req.body?.question ?? '', BLUEPRINT_LIMITS.decisionQuestionMax);
      const context = clampString(req.body?.context ?? '', 1200);
      if (!question) {
        res.status(400).json({ error: 'Please enter the decision or choice you are weighing.' });
        return;
      }

      const ai = getGenAIClient();
      const contextBlock = formatUserContextBlock(req.body?.userContext);

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `${contextBlock}Decision Question: ${question}
Additional Context: ${context || 'None provided'}

Compile a balanced list of pros, cons, and a clear, practical recommendation.`,
        config: {
          systemInstruction:
            'You are libralix, a strategic decision advisor. Weigh trade-offs fairly in plain language.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              pros: { type: Type.ARRAY, items: { type: Type.STRING } },
              cons: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING },
            },
            required: ['pros', 'cons', 'recommendation'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        pros?: string[];
        cons?: string[];
        recommendation?: string;
      };

      res.json({
        question,
        pros: clampStringArray(
          parsed.pros ?? [],
          BLUEPRINT_LIMITS.decisionListMaxItems,
          BLUEPRINT_LIMITS.decisionItemMax
        ),
        cons: clampStringArray(
          parsed.cons ?? [],
          BLUEPRINT_LIMITS.decisionListMaxItems,
          BLUEPRINT_LIMITS.decisionItemMax
        ),
        recommendation:
          clampString(parsed.recommendation, BLUEPRINT_LIMITS.decisionRecommendationMax) ||
          'Weigh the highest-impact trade-offs before deciding.',
      });
    } catch (err) {
      const { status, message } = getApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // 5. Schedule Optimization
  app.post('/api/agent/schedule-suggest', async (req, res) => {
    try {
      const date = clampString(req.body?.date ?? '', 10);
      const freeSlots = Array.isArray(req.body?.freeSlots) ? req.body.freeSlots : [];
      const pendingTasks = Array.isArray(req.body?.pendingTasks) ? req.body.pendingTasks : [];
      if (!date || freeSlots.length === 0 || pendingTasks.length === 0) {
        res.status(400).json({
          error: 'Provide a date, at least one open time slot, and at least one open task.',
        });
        return;
      }

      const ai = getGenAIClient();
      const contextBlock = formatUserContextBlock(req.body?.userContext);

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `${contextBlock}Date: ${date}
Available Time Slots: ${JSON.stringify(freeSlots.slice(0, 8))}
Pending Tasks: ${JSON.stringify(pendingTasks.slice(0, 10))}

Recommend up to 3 focused schedule blocks matching top pending tasks into the available slots without overlapping.`,
        config: {
          systemInstruction:
            'You are libralix, a calendar optimization assistant. Assign high-priority work to uninterrupted deep-work slots.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    startTime: { type: Type.STRING },
                    endTime: { type: Type.STRING },
                    category: {
                      type: Type.STRING,
                      enum: ['deep_work', 'meeting', 'personal', 'review'],
                    },
                    reason: { type: Type.STRING },
                  },
                  required: ['title', 'startTime', 'endTime', 'category', 'reason'],
                },
              },
            },
            required: ['suggestions'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{"suggestions":[]}').trim()) as {
        suggestions?: Array<{
          title?: string;
          startTime?: string;
          endTime?: string;
          category?: string;
          reason?: string;
        }>;
      };

      res.json({
        suggestions: (parsed.suggestions ?? []).slice(0, 3).map((s) => ({
          title: clampString(s.title, BLUEPRINT_LIMITS.eventTitleMax),
          startTime: clampString(s.startTime, 5),
          endTime: clampString(s.endTime, 5),
          category:
            s.category === 'meeting' || s.category === 'personal' || s.category === 'review'
              ? s.category
              : 'deep_work',
          reason: clampString(s.reason, 300),
        })),
      });
    } catch (err) {
      const { status, message } = getApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // 6. Contextual Memory Synthesis
  app.post('/api/agent/update-memory', async (req, res) => {
    try {
      const recentActivity = clampString(req.body?.recentActivity ?? '', 3000);
      const currentMemory = clampString(req.body?.currentMemory ?? '', 1500);
      if (!recentActivity) {
        res.status(400).json({ error: 'No recent activity provided to summarize.' });
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Previous Learned Memory:\n${currentMemory || 'None yet'}\n\nRecent Workspace Activity:\n${recentActivity}\n\nSynthesize a concise, factual summary (under 800 characters) of the user's active focus areas, habits, and key priorities.`,
        config: {
          systemInstruction:
            'You are libralix, maintaining contextual user memory. Write clear, plain-English observations.',
        },
      });

      const learnedContext = clampString(
        response.text ?? currentMemory,
        BLUEPRINT_LIMITS.learnedContextMax
      );
      res.json({ learnedContext });
    } catch (err) {
      const { status, message } = getApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // 7. Outbound Webhook / Tool Sync Test
  app.post('/api/agent/webhook-sync', async (req, res) => {
    try {
      const endpointUrl = clampString(req.body?.endpointUrl ?? '', BLUEPRINT_LIMITS.endpointUrlMax);
      const toolName = clampString(req.body?.toolName ?? 'External Tool', 100);
      if (!endpointUrl || !/^https:\/\/.+/i.test(endpointUrl)) {
        res.status(400).json({ error: 'A valid https:// endpoint URL is required to test sync.' });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const resp = await fetch(endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'libralix',
            toolName,
            event: 'sync_test',
            timestamp: new Date().toISOString(),
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        res.json({ ok: resp.ok, status: resp.status });
      } catch (fetchErr) {
        clearTimeout(timeout);
        res.status(502).json({
          error:
            fetchErr instanceof Error
              ? `Could not reach endpoint: ${fetchErr.message}`
              : 'Could not reach webhook endpoint.',
        });
      }
    } catch (err) {
      const { status, message } = getApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // 8. Gmail Integration (Client Bearer token only — no server secrets or redirects)
  function decodeBase64Url(input?: string): string {
    if (!input) return '';
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8');
  }

  interface GmailPayloadPart {
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailPayloadPart[];
    headers?: Array<{ name?: string; value?: string }>;
  }

  function extractGmailText(part?: GmailPayloadPart): string {
    if (!part) return '';
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBase64Url(part.body.data).trim();
    }
    if (Array.isArray(part.parts)) {
      for (const child of part.parts) {
        const plain = extractGmailText(child);
        if (plain) return plain;
      }
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      return decodeBase64Url(part.body.data)
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (part.body?.data) {
      return decodeBase64Url(part.body.data).trim();
    }
    return '';
  }

  function extractEmailAddress(fromHeader: string): string {
    const match = fromHeader.match(/<([^>]+)>/);
    if (match?.[1]) return match[1].trim();
    const direct = fromHeader.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return direct ? direct[0].trim() : '';
  }

  app.get('/api/gmail/messages', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Gmail permission is required. Please connect Gmail first.' });
      return;
    }

    try {
      const listResp = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=in:inbox',
        { headers: { Authorization: authHeader } }
      );
      if (!listResp.ok) {
        const errBody = (await listResp.json().catch(() => ({}))) as { error?: { message?: string } };
        res.status(listResp.status).json({
          error:
            listResp.status === 401
              ? 'Gmail session expired. Please reconnect Gmail.'
              : errBody?.error?.message || 'Unable to load Gmail messages.',
        });
        return;
      }

      const listData = (await listResp.json()) as {
        messages?: Array<{ id: string; threadId?: string }>;
      };
      const refs = (listData.messages ?? []).slice(0, 8);

      const detailed = await Promise.all(
        refs.map(async (ref) => {
          const msgResp = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(ref.id)}?format=full`,
            { headers: { Authorization: authHeader } }
          );
          if (!msgResp.ok) return null;
          const msg = (await msgResp.json()) as {
            id: string;
            threadId?: string;
            snippet?: string;
            payload?: GmailPayloadPart;
          };
          const headers = msg.payload?.headers ?? [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
          const fromRaw = getHeader('From');
          const subject = getHeader('Subject') || '(No subject)';
          const date = getHeader('Date');
          const messageIdHeader = getHeader('Message-ID');
          const bodyText = clampString(
            extractGmailText(msg.payload) || msg.snippet || '',
            BLUEPRINT_LIMITS.triageSnippetMax
          );
          return {
            id: msg.id,
            threadId: msg.threadId || '',
            messageIdHeader,
            sender: clampString(fromRaw, BLUEPRINT_LIMITS.triageSenderMax),
            senderEmail: extractEmailAddress(fromRaw),
            subject: clampString(subject, BLUEPRINT_LIMITS.triageSubjectMax),
            date,
            snippet: clampString(msg.snippet || bodyText, 240),
            body: bodyText || clampString(msg.snippet || subject, BLUEPRINT_LIMITS.triageSnippetMax),
          };
        })
      );

      res.json({
        messages: detailed.filter((m): m is NonNullable<typeof m> => m !== null),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to fetch Gmail messages.',
      });
    }
  });

  app.post('/api/gmail/send', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Gmail permission is required. Please connect Gmail first.' });
      return;
    }

    const to = clampString(req.body?.to ?? '', 200);
    const subject = clampString(req.body?.subject ?? 'Re: Follow-up', 200);
    const body = clampString(req.body?.body ?? '', 4000);
    const threadId = clampString(req.body?.threadId ?? '', 120);
    const inReplyTo = clampString(req.body?.inReplyTo ?? '', 250);

    if (!to || !body) {
      res.status(400).json({ error: 'Recipient email address and message text are required.' });
      return;
    }

    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
    const lines = [
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
    ];
    if (inReplyTo) {
      lines.push(`In-Reply-To: ${inReplyTo}`);
      lines.push(`References: ${inReplyTo}`);
    }
    lines.push('', body);

    const raw = Buffer.from(lines.join('\r\n'), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    try {
      const payload: Record<string, string> = { raw };
      if (threadId) payload.threadId = threadId;

      const sendResp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const sendData = (await sendResp.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };
      if (!sendResp.ok) {
        res.status(sendResp.status).json({
          error:
            sendResp.status === 401
              ? 'Gmail permission expired. Please reconnect Gmail.'
              : sendData?.error?.message || 'Unable to send Gmail reply.',
        });
        return;
      }
      res.json({ ok: true, id: sendData.id || '' });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to send email via Gmail.',
      });
    }
  });

  // 9. WhatsApp QR Session, Business Cloud API & Incoming Webhook Integration
  interface WhatsAppInboxMessage {
    id: string;
    fromPhone: string;
    fromJid?: string;
    senderName: string;
    body: string;
    timestamp: string;
  }

  const whatsappInbox: WhatsAppInboxMessage[] = [];
  const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'libralix-wa-verify';

  app.get('/api/webhooks/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN && typeof challenge === 'string') {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
  });

  app.post('/api/webhooks/whatsapp', (req, res) => {
    try {
      const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value;
          const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
          const messages = Array.isArray(value?.messages) ? value.messages : [];
          for (const msg of messages) {
            const fromPhone = clampString(msg?.from ?? '', 40);
            const matchedContact = contacts.find((c: { wa_id?: string }) => c?.wa_id === fromPhone);
            const senderName = clampString(
              matchedContact?.profile?.name || fromPhone || 'WhatsApp Contact',
              120
            );
            const textBody = clampString(
              msg?.text?.body || msg?.image?.caption || msg?.document?.caption || '',
              BLUEPRINT_LIMITS.triageSnippetMax
            );
            if (fromPhone && textBody) {
              const id = clampString(msg?.id || `wa_${Date.now()}`, 80);
              if (!whatsappInbox.some((existing) => existing.id === id)) {
                whatsappInbox.unshift({
                  id,
                  fromPhone,
                  senderName,
                  body: textBody,
                  timestamp: msg?.timestamp
                    ? new Date(Number(msg.timestamp) * 1000).toISOString()
                    : new Date().toISOString(),
                });
                if (whatsappInbox.length > 30) {
                  whatsappInbox.length = 30;
                }
              }
            }
          }
        }
      }
      res.sendStatus(200);
    } catch {
      res.sendStatus(200);
    }
  });

  app.get('/api/whatsapp/inbox', (_req, res) => {
    const session = getWhatsAppSessionState();
    const cloudConfigured = Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
    );
    const seen = new Set<string>();
    const mergedMessages: WhatsAppInboxMessage[] = [];
    for (const msg of [...getWhatsAppQrMessages(), ...whatsappInbox]) {
      if (!seen.has(msg.id)) {
        seen.add(msg.id);
        mergedMessages.push(msg);
      }
    }
    mergedMessages.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    res.json({
      configured: cloudConfigured || session.status === 'connected',
      qrStatus: session.status,
      qrDataUrl: session.qrDataUrl,
      connectedPhone: session.connectedPhone,
      connectedName: session.connectedName,
      error: session.error,
      messages: mergedMessages.slice(0, 30),
    });
  });

  app.post('/api/whatsapp/qr/start', async (req, res) => {
    try {
      const forceRefresh = Boolean(req.body?.forceRefresh);
      const snapshot = await startWhatsAppQrSession({ forceRefresh });
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to start WhatsApp QR session.',
      });
    }
  });

  app.post('/api/whatsapp/qr/disconnect', async (_req, res) => {
    try {
      const snapshot = await disconnectWhatsAppQrSession();
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to disconnect WhatsApp session.',
      });
    }
  });

  app.post('/api/whatsapp/send', async (req, res) => {
    const to = clampString(req.body?.to ?? '', 40).replace(/[^\d+]/g, '');
    const jid = clampString(req.body?.jid ?? '', 120);
    const body = clampString(req.body?.body ?? '', 3000);

    if ((!to && !jid) || !body) {
      res.status(400).json({ error: 'Recipient phone number and reply message are required.' });
      return;
    }

    const session = getWhatsAppSessionState();
    if (session.status === 'connected') {
      try {
        const sent = await sendWhatsAppViaQrSession({ to, jid, body });
        res.json({ ok: true, id: sent.id });
        return;
      } catch (err) {
        res.status(502).json({
          error:
            err instanceof Error
              ? `Unable to send via WhatsApp QR session: ${err.message}`
              : 'Unable to send via WhatsApp QR session.',
        });
        return;
      }
    }

    const phoneNumberId = clampString(process.env.WHATSAPP_PHONE_NUMBER_ID || '', 80);
    const accessToken = clampString(process.env.WHATSAPP_ACCESS_TOKEN || '', 500);

    if (!phoneNumberId || !accessToken) {
      res.status(422).json({
        error:
          'Connect WhatsApp via QR code first, or use Open in WhatsApp to send directly.',
      });
      return;
    }

    try {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body },
          }),
        }
      );
      const data = (await resp.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      };
      if (!resp.ok) {
        res.status(resp.status).json({
          error: data?.error?.message || 'WhatsApp Cloud API rejected the message.',
        });
        return;
      }
      res.json({ ok: true, id: data?.messages?.[0]?.id || '' });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? `Unable to send WhatsApp message: ${err.message}`
            : 'Unable to send WhatsApp message.',
      });
    }
  });

  // Vite dev middleware or static production serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`libralix server listening on http://localhost:${PORT}`);
  });
}

startServer();
