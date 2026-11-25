import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Copy,
  ExternalLink,
  Inbox,
  ListPlus,
  Mail,
  MessageCircle,
  QrCode,
  RefreshCw,
  Send,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import type {
  InboxTriageItem,
  TaskPriority,
  ToolIntegration,
  TriagePriority,
  UserProfile,
} from '../types/libralix';
import {
  disconnectWhatsAppQr,
  fetchGmailMessages,
  getWhatsAppInbox,
  sendGmailReply,
  sendWhatsAppReply,
  startWhatsAppQr,
  triageEmailMessage,
  type GmailInboxMessage,
  type WhatsAppInboxMessage,
  type WhatsAppQrStatus,
} from '../services/agentApi';
import { useAuth } from '../contexts/AuthContext';

interface InboxTriageViewProps {
  profile: UserProfile | null;
  items: InboxTriageItem[];
  integrations: ToolIntegration[];
  onCreateTriage: (input: {
    sender: string;
    subject: string;
    originalSnippet: string;
    summary: string;
    suggestedReply: string;
    priority: TriagePriority;
  }) => Promise<void>;
  onArchiveTriage: (triageId: string) => Promise<void>;
  onDeleteTriage: (triageId: string) => Promise<void>;
  onAddExtractedTask: (input: {
    title: string;
    notes: string;
    priority: TaskPriority;
    dueDate: string;
    source: 'email';
  }) => Promise<void>;
  onRecordIntegration?: (
    input: Omit<ToolIntegration, 'id' | 'uid' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
}

interface PendingSendModalState {
  channel: 'gmail' | 'whatsapp';
  to: string;
  jid?: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
}

function extractEmail(raw: string): string {
  const angleMatch = raw.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim();
  const plainMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plainMatch ? plainMatch[0].trim() : '';
}

function extractPhone(raw: string): string {
  const match = raw.match(/\+?\d[\d\s-]{6,18}\d/);
  return match ? match[0].replace(/[^\d+]/g, '') : '';
}

function buildWhatsAppDeepLink(to: string, message: string): string {
  const digits = to.replace(/\D/g, '');
  const encodedText = encodeURIComponent(message.trim());
  return digits ? `https://wa.me/${digits}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
}

export function InboxTriageView({
  profile,
  items,
  integrations,
  onCreateTriage,
  onArchiveTriage,
  onDeleteTriage,
  onAddExtractedTask,
  onRecordIntegration,
}: InboxTriageViewProps) {
  const { googleAccessToken, connectGmail, connectingGmail, clearGoogleAccessToken } = useAuth();

  // Channel filter / manual input state (always starts clean)
  const [channelInput, setChannelInput] = useState<'email' | 'whatsapp'>('email');
  const [sender, setSender] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [lastExtractedTasks, setLastExtractedTasks] = useState<
    Array<{ title: string; priority: TaskPriority }>
  >([]);
  const bodyInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Gmail live state
  const [gmailMessages, setGmailMessages] = useState<GmailInboxMessage[]>([]);
  const [loadingGmail, setLoadingGmail] = useState(false);
  const [triagingMessageId, setTriagingMessageId] = useState<string | null>(null);

  // WhatsApp live state (QR Linked Devices + server Cloud API fallback)
  const [waConfiguredOnServer, setWaConfiguredOnServer] = useState(false);
  const [waQrStatus, setWaQrStatus] = useState<WhatsAppQrStatus>('disconnected');
  const [waQrDataUrl, setWaQrDataUrl] = useState<string | null>(null);
  const [waConnectedPhone, setWaConnectedPhone] = useState('');
  const [waConnectedName, setWaConnectedName] = useState('');
  const [waQrError, setWaQrError] = useState<string | null>(null);
  const [startingWaQr, setStartingWaQr] = useState(false);
  const [loadingWa, setLoadingWa] = useState(false);
  const [waMessages, setWaMessages] = useState<WhatsAppInboxMessage[]>([]);

  // Explicit user confirmation modal before sending any Gmail/WhatsApp reply
  const [pendingSend, setPendingSend] = useState<PendingSendModalState | null>(null);
  const [sendingReply, setSendingReply] = useState(false);

  const waWebhookUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp` : '';

  useEffect(() => {
    void refreshWhatsAppInbox(true);
  }, []);

  useEffect(() => {
    if (waQrStatus !== 'connecting' && waQrStatus !== 'qr_ready') return;
    const timer = window.setInterval(() => {
      void refreshWhatsAppInbox(true);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [waQrStatus]);

  async function ensureChannelRecorded(name: 'Gmail' | 'WhatsApp', notes: string) {
    if (!onRecordIntegration) return;
    const exists = integrations.some((i) => i.toolName.toLowerCase() === name.toLowerCase());
    if (exists) return;
    try {
      await onRecordIntegration({
        toolName: name,
        toolType: name === 'Gmail' ? 'email' : 'webhook',
        endpointUrl: name === 'WhatsApp' ? waWebhookUrl : 'https://gmail.googleapis.com',
        syncEnabled: true,
        notes,
      });
    } catch {
      // Non-fatal if recording integration fails
    }
  }

  async function handleConnectAndLoadGmail() {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      let token = googleAccessToken;
      if (!token) {
        token = await connectGmail();
      }
      if (!token) return;
      setLoadingGmail(true);
      const msgs = await fetchGmailMessages(token);
      setGmailMessages(msgs);
      await ensureChannelRecorded('Gmail', 'Connected to Inbox Helper (read & reply)');
      setStatusMsg(
        msgs.length > 0
          ? `Loaded ${msgs.length} recent Gmail message${msgs.length === 1 ? '' : 's'}.`
          : 'Gmail connected. Your inbox returned no messages.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to load Gmail.';
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('401')) {
        clearGoogleAccessToken();
      }
      setErrorMsg(msg);
    } finally {
      setLoadingGmail(false);
    }
  }

  async function refreshWhatsAppInbox(silent = false) {
    if (!silent) {
      setErrorMsg(null);
      setStatusMsg(null);
    }
    setLoadingWa(true);
    try {
      const res = await getWhatsAppInbox();
      setWaConfiguredOnServer(res.configured);
      setWaQrStatus(res.qrStatus);
      setWaQrDataUrl(res.qrDataUrl);
      setWaConnectedPhone(res.connectedPhone);
      setWaConnectedName(res.connectedName);
      setWaQrError(res.error);
      setWaMessages(res.messages);
      if (res.configured || res.qrStatus === 'connected') {
        await ensureChannelRecorded(
          'WhatsApp',
          res.qrStatus === 'connected'
            ? `Linked via WhatsApp QR${res.connectedPhone ? ` (+${res.connectedPhone})` : ''}`
            : 'Connected via server WhatsApp API'
        );
      }
      if (!silent) {
        setStatusMsg(
          res.messages.length > 0
            ? `Synced ${res.messages.length} WhatsApp message${res.messages.length === 1 ? '' : 's'}.`
            : res.qrStatus === 'connected'
              ? 'WhatsApp linked and synced.'
              : 'WhatsApp checked. Scan the QR code below to connect your WhatsApp.'
        );
      }
    } catch (err) {
      if (!silent) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to check WhatsApp inbox.');
      }
    } finally {
      setLoadingWa(false);
    }
  }

  async function handleStartWhatsAppQr(forceRefresh = false) {
    setErrorMsg(null);
    setStatusMsg(null);
    setWaQrError(null);
    setStartingWaQr(true);
    try {
      const snap = await startWhatsAppQr(forceRefresh);
      setWaQrStatus(snap.status);
      setWaQrDataUrl(snap.qrDataUrl);
      setWaConnectedPhone(snap.connectedPhone);
      setWaConnectedName(snap.connectedName);
      setWaQrError(snap.error);
      if (snap.status === 'connected') {
        setWaConfiguredOnServer(true);
        setStatusMsg('WhatsApp connected via Linked Devices.');
        await refreshWhatsAppInbox(true);
      } else if (snap.status === 'qr_ready') {
        setStatusMsg('Scan the WhatsApp QR code with Linked Devices on your phone.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate WhatsApp QR code.');
    } finally {
      setStartingWaQr(false);
    }
  }

  async function handleDisconnectWhatsAppQr() {
    setErrorMsg(null);
    setStatusMsg(null);
    setStartingWaQr(true);
    try {
      const snap = await disconnectWhatsAppQr();
      setWaQrStatus(snap.status);
      setWaQrDataUrl(snap.qrDataUrl);
      setWaConnectedPhone('');
      setWaConnectedName('');
      setWaQrError(null);
      setStatusMsg('WhatsApp QR session disconnected.');
      await refreshWhatsAppInbox(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to disconnect WhatsApp.');
    } finally {
      setStartingWaQr(false);
    }
  }

  function handleQuickWhatsAppCompose() {
    setChannelInput('whatsapp');
    setErrorMsg(null);
    bodyInputRef.current?.focus();
  }

  async function handleTriageGmailItem(msg: GmailInboxMessage) {
    setErrorMsg(null);
    setStatusMsg(null);
    setTriagingMessageId(msg.id);
    try {
      const result = await triageEmailMessage({
        sender: msg.sender,
        subject: msg.subject,
        body: msg.body,
        userContext: profile,
      });
      await onCreateTriage({
        sender: msg.sender,
        subject: msg.subject,
        originalSnippet: msg.body,
        summary: result.summary || 'Summary unavailable.',
        suggestedReply: result.suggestedReply ?? '',
        priority: result.priority ?? 'normal',
      });
      setLastExtractedTasks(Array.isArray(result.extractedTasks) ? result.extractedTasks : []);
      setStatusMsg(`Triaged Gmail message "${msg.subject}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to triage Gmail message.');
    } finally {
      setTriagingMessageId(null);
    }
  }

  async function handleTriageWhatsAppItem(msg: WhatsAppInboxMessage) {
    setErrorMsg(null);
    setStatusMsg(null);
    setTriagingMessageId(msg.id);
    try {
      const label = msg.senderName ? `${msg.senderName} (${msg.fromPhone})` : msg.fromPhone;
      const waSubject = `WhatsApp from ${msg.senderName || msg.fromPhone}`;
      const result = await triageEmailMessage({
        sender: label,
        subject: waSubject,
        body: msg.body,
        userContext: profile,
      });
      await onCreateTriage({
        sender: label,
        subject: waSubject,
        originalSnippet: msg.body,
        summary: result.summary || 'Summary unavailable.',
        suggestedReply: result.suggestedReply ?? '',
        priority: result.priority ?? 'normal',
      });
      setLastExtractedTasks(Array.isArray(result.extractedTasks) ? result.extractedTasks : []);
      setStatusMsg(`Triaged WhatsApp message from ${msg.senderName || msg.fromPhone}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to triage WhatsApp message.');
    } finally {
      setTriagingMessageId(null);
    }
  }

  async function handleTriageSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    const effectiveSubject =
      subject.trim() ||
      (channelInput === 'whatsapp' ? `WhatsApp from ${sender.trim() || 'Contact'}` : '');
    if (!effectiveSubject || !body.trim()) {
      setErrorMsg(
        channelInput === 'whatsapp'
          ? 'Please enter the WhatsApp message content.'
          : 'Please enter both a subject and message text.'
      );
      return;
    }

    setLoading(true);
    try {
      const result = await triageEmailMessage({
        sender: sender.trim(),
        subject: effectiveSubject,
        body: body.trim(),
        userContext: profile,
      });
      await onCreateTriage({
        sender: sender.trim(),
        subject: effectiveSubject,
        originalSnippet: body.trim(),
        summary: result.summary || 'Summary unavailable.',
        suggestedReply: result.suggestedReply ?? '',
        priority: result.priority ?? 'normal',
      });
      setLastExtractedTasks(Array.isArray(result.extractedTasks) ? result.extractedTasks : []);
      setSender('');
      setSubject('');
      setBody('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to analyze message.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTask(task: { title: string; priority: TaskPriority }) {
    try {
      await onAddExtractedTask({
        title: task.title,
        notes: 'Extracted from Inbox Helper',
        priority: task.priority,
        dueDate: '',
        source: 'email',
      });
      setLastExtractedTasks((prev) => prev.filter((t) => t.title !== task.title));
      setStatusMsg(`Added "${task.title}" to Tasks.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add task.');
    }
  }

  async function handleCopyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatusMsg(`Copied ${label} to clipboard.`);
    } catch {
      setStatusMsg(`Select and copy the ${label} directly.`);
    }
  }

  function openSendModal(channel: 'gmail' | 'whatsapp', item: InboxTriageItem) {
    const matchedGmail = gmailMessages.find(
      (g) => g.subject === item.subject || g.sender === item.sender
    );
    const matchedWa = waMessages.find(
      (w) =>
        item.sender.includes(w.fromPhone) ||
        (w.senderName && item.sender.includes(w.senderName))
    );
    const defaultTo =
      channel === 'gmail'
        ? matchedGmail?.senderEmail || extractEmail(item.sender)
        : matchedWa?.fromPhone || extractPhone(item.sender);
    const replySubject = item.subject.toLowerCase().startsWith('re:')
      ? item.subject
      : `Re: ${item.subject}`;

    setPendingSend({
      channel,
      to: defaultTo,
      jid: matchedWa?.fromJid,
      subject: replySubject,
      body: item.suggestedReply,
      threadId: matchedGmail?.threadId,
      inReplyTo: matchedGmail?.messageIdHeader,
    });
  }

  async function handleConfirmSend() {
    if (!pendingSend) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setSendingReply(true);
    try {
      if (pendingSend.channel === 'gmail') {
        let token = googleAccessToken;
        if (!token) {
          token = await connectGmail();
        }
        if (!token) throw new Error('Gmail authorization is required to send.');
        await sendGmailReply(token, {
          to: pendingSend.to.trim(),
          subject: pendingSend.subject.trim(),
          body: pendingSend.body.trim(),
          threadId: pendingSend.threadId,
          inReplyTo: pendingSend.inReplyTo,
        });
        setStatusMsg(`Sent Gmail reply to ${pendingSend.to}.`);
      } else {
        await sendWhatsAppReply({
          to: pendingSend.to.trim(),
          jid: pendingSend.jid,
          body: pendingSend.body.trim(),
        });
        setStatusMsg(`Sent WhatsApp reply to ${pendingSend.to || pendingSend.jid}.`);
      }
      setPendingSend(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send reply.');
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Connected Channels: Gmail & WhatsApp */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gmail Card */}
        <div className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#FFE0EC] border border-[#EAA3C0] flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-[#B5306B]" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm">
                  <h2 className="font-semibold text-[#381325]">Gmail</h2>
                  <span aria-hidden="true" className="text-[#DF84A8]">
                    ·
                  </span>
                  {googleAccessToken ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-xs text-[#6D3B54]">Ready to connect</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[#6D3B54]">
                  Pull recent emails directly into Inbox Helper and send confirmed replies.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleConnectAndLoadGmail()}
              disabled={connectingGmail || loadingGmail}
              className="px-3.5 py-1.5 text-xs font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${connectingGmail || loadingGmail ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>
                {connectingGmail
                  ? 'Connecting...'
                  : loadingGmail
                    ? 'Loading...'
                    : googleAccessToken
                      ? 'Sync Gmail'
                      : 'Connect Gmail'}
              </span>
            </button>
          </div>

          {gmailMessages.length > 0 && (
            <ul className="divide-y divide-[#F5C2D7] border-t border-[#F5C2D7] pt-2 max-h-60 overflow-y-auto">
              {gmailMessages.map((msg) => (
                <li key={msg.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#381325] truncate">{msg.subject}</p>
                    <p className="text-[11px] text-[#6D3B54] truncate">{msg.sender}</p>
                    <p className="text-[11px] text-[#9B637E] truncate mt-0.5">{msg.snippet}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleTriageGmailItem(msg)}
                    disabled={triagingMessageId === msg.id}
                    className="px-2.5 py-1 text-[11px] font-medium text-[#381325] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {triagingMessageId === msg.id ? 'Triaging...' : 'Triage'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* WhatsApp Card */}
        <div className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#FFE0EC] border border-[#EAA3C0] flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-[#B5306B]" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm">
                  <h2 className="font-semibold text-[#381325]">WhatsApp</h2>
                  <span aria-hidden="true" className="text-[#DF84A8]">
                    ·
                  </span>
                  {waQrStatus === 'connected' || waConfiguredOnServer ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      {waQrStatus === 'connected'
                        ? `Linked${waConnectedPhone ? ` (+${waConnectedPhone})` : ''}`
                        : 'Connected'}
                    </span>
                  ) : waQrStatus === 'qr_ready' ? (
                    <span className="text-xs font-medium text-amber-800">Scan QR to connect</span>
                  ) : (
                    <span className="text-xs text-[#6D3B54]">Ready to pair via QR</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[#6D3B54]">
                  {waQrStatus === 'connected'
                    ? `Active WhatsApp Linked Devices session${waConnectedName ? ` (${waConnectedName})` : ''}. Syncs incoming messages & sends confirmed replies.`
                    : waConfiguredOnServer
                      ? 'WhatsApp integration is active for automatic message sync and replies.'
                      : 'Generate a WhatsApp QR code to link your phone and sync chats in Inbox Helper.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {waQrStatus === 'connected' ? (
                <button
                  type="button"
                  onClick={() => void handleDisconnectWhatsAppQr()}
                  disabled={startingWaQr}
                  className="px-2.5 py-1.5 text-xs font-medium text-rose-800 bg-rose-100 hover:bg-rose-200 border border-rose-300 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Disconnect</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleStartWhatsAppQr(waQrStatus === 'qr_ready')}
                  disabled={startingWaQr}
                  className="px-3 py-1.5 text-xs font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {startingWaQr
                      ? 'Generating...'
                      : waQrStatus === 'qr_ready'
                        ? 'Refresh QR'
                        : 'Connect via QR'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleQuickWhatsAppCompose}
                className="px-2.5 py-1.5 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-lg whitespace-nowrap cursor-pointer"
              >
                Triage Chat
              </button>

              <button
                type="button"
                onClick={() => void refreshWhatsAppInbox(false)}
                disabled={loadingWa}
                className="px-2.5 py-1.5 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] disabled:opacity-60 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingWa ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>Sync</span>
              </button>
            </div>
          </div>

          {waQrError && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
              {waQrError}
            </p>
          )}

          {waQrDataUrl && waQrStatus !== 'connected' && (
            <div className="p-4 rounded-xl bg-[#FFE0EC] border border-[#EAA3C0] flex flex-col sm:flex-row items-center gap-4">
              <div className="bg-[#FFF5F9] p-2.5 rounded-xl border border-[#EAA3C0] shrink-0">
                <img
                  src={waQrDataUrl}
                  alt="WhatsApp Linked Devices QR Code"
                  className="w-40 h-40 block"
                />
              </div>
              <div className="space-y-1.5 text-xs text-[#4D1E35]">
                <p className="text-sm font-semibold text-[#381325]">
                  Scan to Link WhatsApp
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[#6D3B54]">
                  <li>Open WhatsApp on your phone.</li>
                  <li>Tap Settings (or Menu) &rarr; Linked Devices &rarr; Link a Device.</li>
                  <li>Point your phone camera at this QR code.</li>
                </ol>
                <p className="text-[11px] text-[#9B637E] pt-1">
                  Waiting for scan confirmation...
                </p>
              </div>
            </div>
          )}

          {waMessages.length > 0 && (
            <ul className="divide-y divide-[#F5C2D7] border-t border-[#F5C2D7] pt-2 max-h-60 overflow-y-auto">
              {waMessages.map((msg) => (
                <li key={msg.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#381325] truncate">
                      {msg.senderName}{' '}
                      <span className="text-[#9B637E]">({msg.fromPhone || 'WhatsApp'})</span>
                    </p>
                    <p className="text-[11px] text-[#6D3B54] truncate mt-0.5">{msg.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleTriageWhatsAppItem(msg)}
                    disabled={triagingMessageId === msg.id}
                    className="px-2.5 py-1 text-[11px] font-medium text-[#381325] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {triagingMessageId === msg.id ? 'Triaging...' : 'Triage'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Clean Manual Message Triage Form */}
      <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#381325]">Inbox Helper</h2>
            <p className="mt-1 text-sm text-[#6D3B54]">
              Sync Gmail or WhatsApp above, or paste any message below. libralix summarizes key points, scores urgency, drafts a reply, and extracts tasks.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-[#FFE0EC] border border-[#F5C2D7] rounded-lg">
            <button
              type="button"
              onClick={() => setChannelInput('email')}
              className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                channelInput === 'email'
                  ? 'bg-[#F49AC1] text-[#2B0B1B]'
                  : 'text-[#6D3B54] hover:text-[#381325]'
              }`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setChannelInput('whatsapp')}
              className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                channelInput === 'whatsapp'
                  ? 'bg-[#F49AC1] text-[#2B0B1B]'
                  : 'text-[#6D3B54] hover:text-[#381325]'
              }`}
            >
              WhatsApp
            </button>
          </div>
        </div>

        <form onSubmit={(e) => void handleTriageSubmit(e)} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="triage-sender" className="block text-xs font-medium text-[#6D3B54] mb-1">
                {channelInput === 'whatsapp' ? 'Sender name or phone (optional)' : 'From (optional)'}
              </label>
              <input
                id="triage-sender"
                type="text"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder={
                  channelInput === 'whatsapp'
                    ? 'Contact name or +15551234567...'
                    : 'Sender name or email...'
                }
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>

            <div>
              <label htmlFor="triage-subject" className="block text-xs font-medium text-[#6D3B54] mb-1">
                {channelInput === 'whatsapp' ? 'Topic (optional)' : 'Subject'}
              </label>
              <input
                id="triage-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={
                  channelInput === 'whatsapp' ? 'Chat topic...' : 'Email or message subject...'
                }
                className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="triage-body" className="block text-xs font-medium text-[#6D3B54] mb-1">
              Message content
            </label>
            <textarea
              ref={bodyInputRef}
              id="triage-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Paste the email or WhatsApp message text here..."
              className="w-full px-3.5 py-2.5 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>{loading ? 'Analyzing...' : 'Summarize & Draft Reply'}</span>
            </button>
          </div>
        </form>

        {errorMsg && (
          <p role="alert" className="mt-3 text-xs text-rose-700">
            {errorMsg}
          </p>
        )}
        {statusMsg && (
          <p role="status" className="mt-3 text-xs text-emerald-700">
            {statusMsg}
          </p>
        )}

        {lastExtractedTasks.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[#F5C2D7]">
            <p className="text-xs font-semibold text-[#6D3B54] mb-2">
              Action Items Found in Message
            </p>
            <ul className="space-y-2">
              {lastExtractedTasks.map((task, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#FFE0EC] border border-[#F5C2D7]"
                >
                  <span className="text-sm text-[#381325]">{task.title}</span>
                  <button
                    type="button"
                    onClick={() => void handleAddTask(task)}
                    className="px-3 py-1.5 text-xs font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ListPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Add to Tasks</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Triaged History */}
      {items.length === 0 ? (
        <section className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-10 text-center">
          <Inbox className="w-7 h-7 text-[#9B637E] mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-[#4D1E35]">No triaged messages yet</p>
          <p className="mt-1 text-xs text-[#9B637E]">
            Connect Gmail above or paste any email or WhatsApp message to get a quick summary and reply draft.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <article key={item.id} className="bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-[#381325]">{item.subject}</h3>
                  <p className="mt-1 text-xs text-[#6D3B54]">
                    <span>{item.sender || 'Unknown sender'}</span>
                    <span aria-hidden="true"> · </span>
                    <span
                      className={
                        item.priority === 'urgent'
                          ? 'text-rose-700 font-medium'
                          : item.priority === 'normal'
                            ? 'text-[#4D1E35]'
                            : 'text-[#9B637E]'
                      }
                    >
                      {item.priority === 'urgent'
                        ? 'Urgent'
                        : item.priority === 'normal'
                          ? 'Normal priority'
                          : 'Low priority'}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span>{item.status === 'archived' ? 'Archived' : 'Open'}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => void onArchiveTriage(item.id)}
                      className="px-2.5 py-1.5 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Archive</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onDeleteTriage(item.id)}
                    aria-label={`Delete triaged message "${item.subject}"`}
                    className="p-1.5 text-[#9B637E] hover:text-rose-700 rounded-md hover:bg-rose-100 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="mt-3 text-sm text-[#4D1E35] leading-relaxed">{item.summary}</p>

              {item.suggestedReply && (
                <div className="mt-4 p-4 rounded-lg bg-[#FFE0EC] border border-[#F5C2D7]">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <span className="text-xs font-semibold text-[#6D3B54]">Suggested Reply</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleCopyText(item.suggestedReply, 'draft reply')}
                        className="text-xs font-medium text-[#B5306B] hover:text-[#381325] flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copy</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openSendModal('gmail', item)}
                        className="px-2.5 py-1 text-xs font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] rounded-md flex items-center gap-1 cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Send via Gmail</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openSendModal('whatsapp', item)}
                        className="px-2.5 py-1 text-xs font-medium text-[#381325] bg-[#FFF5F9] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-md flex items-center gap-1 cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Send via WhatsApp</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-[#4D1E35] whitespace-pre-line">{item.suggestedReply}</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Mandatory Explicit Confirmation Modal Before Sending Gmail / WhatsApp Reply */}
      {pendingSend && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-send-title"
          className="fixed inset-0 z-50 bg-[#2B0B1B]/45 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg bg-[#FFF5F9] border border-[#EAA3C0] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 id="confirm-send-title" className="text-base font-semibold text-[#381325]">
                Confirm {pendingSend.channel === 'gmail' ? 'Gmail' : 'WhatsApp'} Reply
              </h3>
              <button
                type="button"
                onClick={() => setPendingSend(null)}
                aria-label="Close confirmation dialog"
                className="p-1 text-[#6D3B54] hover:text-[#381325] rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#6D3B54]">
              {pendingSend.channel === 'gmail'
                ? 'Review the recipient, subject, and message below before sending from your Gmail account.'
                : waConfiguredOnServer
                  ? 'Review the phone number and message below before sending via WhatsApp.'
                  : 'Review the recipient and message below, then open WhatsApp to send directly from your account.'}
            </p>

            <div className="space-y-3">
              <div>
                <label htmlFor="confirm-send-to" className="block text-xs font-medium text-[#6D3B54] mb-1">
                  {pendingSend.channel === 'gmail'
                    ? 'Recipient Email'
                    : 'Recipient Phone Number (optional for WhatsApp Web)'}
                </label>
                <input
                  id="confirm-send-to"
                  type="text"
                  value={pendingSend.to}
                  onChange={(e) =>
                    setPendingSend((prev) => (prev ? { ...prev, to: e.target.value } : null))
                  }
                  placeholder={
                    pendingSend.channel === 'gmail' ? 'recipient@example.com' : '+15551234567'
                  }
                  className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] placeholder:text-[#9B637E] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
                />
              </div>

              {pendingSend.channel === 'gmail' && (
                <div>
                  <label
                    htmlFor="confirm-send-subject"
                    className="block text-xs font-medium text-[#6D3B54] mb-1"
                  >
                    Subject
                  </label>
                  <input
                    id="confirm-send-subject"
                    type="text"
                    value={pendingSend.subject}
                    onChange={(e) =>
                      setPendingSend((prev) =>
                        prev ? { ...prev, subject: e.target.value } : null
                      )
                    }
                    className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
                  />
                </div>
              )}

              <div>
                <label htmlFor="confirm-send-body" className="block text-xs font-medium text-[#6D3B54] mb-1">
                  Message
                </label>
                <textarea
                  id="confirm-send-body"
                  rows={5}
                  value={pendingSend.body}
                  onChange={(e) =>
                    setPendingSend((prev) => (prev ? { ...prev, body: e.target.value } : null))
                  }
                  className="w-full px-3.5 py-2 text-sm bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg text-[#381325] focus:outline-none focus:ring-2 focus:ring-[#F49AC1]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingSend(null)}
                disabled={sendingReply}
                className="px-4 py-2 text-xs font-medium text-[#4D1E35] bg-[#FFE0EC] hover:bg-[#FFD1E2] border border-[#EAA3C0] rounded-lg cursor-pointer"
              >
                Cancel
              </button>

              {pendingSend.channel === 'whatsapp' &&
              !waConfiguredOnServer &&
              waQrStatus !== 'connected' ? (
                <a
                  href={buildWhatsAppDeepLink(pendingSend.to, pendingSend.body)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setStatusMsg('Opened reply draft in WhatsApp.');
                    setPendingSend(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Open &amp; Send in WhatsApp</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConfirmSend()}
                  disabled={
                    sendingReply ||
                    (!pendingSend.to.trim() && !pendingSend.jid) ||
                    !pendingSend.body.trim()
                  }
                  className="px-4 py-2 text-xs font-semibold text-[#2B0B1B] bg-[#F49AC1] hover:bg-[#EC7FB0] disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {sendingReply
                    ? 'Sending...'
                    : `Confirm & Send ${pendingSend.channel === 'gmail' ? 'Email' : 'WhatsApp'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
