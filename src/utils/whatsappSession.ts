import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import { BLUEPRINT_LIMITS, clampString } from './validation.ts';

export type WhatsAppQrStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'error';

export interface WhatsAppQrInboxItem {
  id: string;
  fromPhone: string;
  fromJid: string;
  senderName: string;
  body: string;
  timestamp: string;
}

export interface WhatsAppSessionSnapshot {
  status: WhatsAppQrStatus;
  qrDataUrl: string | null;
  connectedPhone: string;
  connectedName: string;
  error: string | null;
}

const AUTH_DIR = path.join(os.tmpdir(), 'libralix-wa-auth');

let activeSocket: WASocket | null = null;
let sessionStatus: WhatsAppQrStatus = 'disconnected';
let currentQrDataUrl: string | null = null;
let connectedPhone = '';
let connectedName = '';
let lastError: string | null = null;
let connectionGeneration = 0;
let qrGeneratedAt = 0;
let qrUpdatesForAttempt = 0;
const incomingQrMessages: WhatsAppQrInboxItem[] = [];

function clearAuthFolder() {
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function extractPhoneFromJid(jid: string): string {
  const beforeAt = jid.split('@')[0] || '';
  const withoutDevice = beforeAt.split(':')[0] || '';
  return withoutDevice.replace(/[^\d]/g, '') || withoutDevice;
}

function extractIncomingMessageText(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim();
}

function closeActiveSocket() {
  if (activeSocket) {
    try {
      activeSocket.end(undefined);
    } catch {
      // Ignore close error
    }
    activeSocket = null;
  }
}

export function getWhatsAppSessionState(): WhatsAppSessionSnapshot {
  return {
    status: sessionStatus,
    qrDataUrl: currentQrDataUrl,
    connectedPhone,
    connectedName,
    error: lastError,
  };
}

export function getWhatsAppQrMessages(): WhatsAppQrInboxItem[] {
  return [...incomingQrMessages];
}

export async function startWhatsAppQrSession(options?: {
  forceRefresh?: boolean;
}): Promise<WhatsAppSessionSnapshot> {
  const forceRefresh = Boolean(options?.forceRefresh);

  if (!forceRefresh && sessionStatus === 'connected' && activeSocket) {
    return getWhatsAppSessionState();
  }

  if (
    !forceRefresh &&
    sessionStatus === 'qr_ready' &&
    currentQrDataUrl &&
    activeSocket &&
    Date.now() - qrGeneratedAt < 25000
  ) {
    return getWhatsAppSessionState();
  }

  connectionGeneration += 1;
  const myGen = connectionGeneration;

  closeActiveSocket();
  if (forceRefresh) {
    clearAuthFolder();
    connectedPhone = '';
    connectedName = '';
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  sessionStatus = 'connecting';
  currentQrDataUrl = null;
  lastError = null;
  qrUpdatesForAttempt = 0;

  let settleWaiter: (() => void) | null = null;
  const waitForQrOrOpen = new Promise<void>((resolve) => {
    settleWaiter = resolve;
  });

  const finishWaiting = () => {
    if (settleWaiter) {
      const done = settleWaiter;
      settleWaiter = null;
      done();
    }
  };

  const launchSocket = async (gen: number) => {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      let waVersion: [number, number, number] | undefined;
      try {
        const latest = await fetchLatestBaileysVersion();
        waVersion = latest.version;
      } catch {
        waVersion = undefined;
      }

      if (gen !== connectionGeneration) {
        finishWaiting();
        return;
      }

      const sock = makeWASocket({
        ...(waVersion ? { version: waVersion } : {}),
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      activeSocket = sock;
      let wasConnected = false;

      sock.ev.on('creds.update', () => {
        if (gen !== connectionGeneration) return;
        void saveCreds();
      });

      sock.ev.on('messages.upsert', ({ messages }) => {
        if (gen !== connectionGeneration) return;
        for (const msg of messages) {
          if (!msg?.key || msg.key.fromMe) continue;
          const remoteJid = msg.key.remoteJid || '';
          if (!remoteJid || remoteJid === 'status@broadcast') continue;

          const bodyText = clampString(
            extractIncomingMessageText(msg),
            BLUEPRINT_LIMITS.triageSnippetMax
          );
          if (!bodyText) continue;

          const id = clampString(msg.key.id || `wa_qr_${Date.now()}`, 80);
          if (incomingQrMessages.some((existing) => existing.id === id)) continue;

          const altJid =
            (msg.key as { remoteJidAlt?: string }).remoteJidAlt || remoteJid;
          const fromPhone = clampString(extractPhoneFromJid(altJid), 40);
          const senderName = clampString(
            msg.pushName || fromPhone || 'WhatsApp Contact',
            120
          );
          const tsSeconds = Number(msg.messageTimestamp || 0);
          const timestamp =
            tsSeconds > 0
              ? new Date(tsSeconds * 1000).toISOString()
              : new Date().toISOString();

          incomingQrMessages.unshift({
            id,
            fromPhone,
            fromJid: remoteJid,
            senderName,
            body: bodyText,
            timestamp,
          });
          if (incomingQrMessages.length > 30) {
            incomingQrMessages.length = 30;
          }
        }
      });

      sock.ev.on('connection.update', async (update) => {
        if (gen !== connectionGeneration) return;

        if (update.qr) {
          qrUpdatesForAttempt += 1;
          if (qrUpdatesForAttempt > 5) {
            connectionGeneration += 1;
            closeActiveSocket();
            sessionStatus = 'disconnected';
            currentQrDataUrl = null;
            lastError = 'QR code expired before scanning. Click Connect via QR to generate a new code.';
            finishWaiting();
            return;
          }
          try {
            const dataUrl = await QRCode.toDataURL(update.qr, {
              width: 280,
              margin: 2,
              color: {
                dark: '#2B0B1B',
                light: '#FFF5F9',
              },
            });
            if (gen !== connectionGeneration) return;
            currentQrDataUrl = dataUrl;
            qrGeneratedAt = Date.now();
            sessionStatus = 'qr_ready';
            lastError = null;
            finishWaiting();
          } catch (qrErr) {
            lastError =
              qrErr instanceof Error ? qrErr.message : 'Unable to render WhatsApp QR code.';
            sessionStatus = 'error';
            finishWaiting();
          }
        }

        if (update.connection === 'open') {
          wasConnected = true;
          sessionStatus = 'connected';
          currentQrDataUrl = null;
          lastError = null;
          connectedPhone = extractPhoneFromJid(sock.user?.id || '');
          connectedName = clampString(sock.user?.name || '', 80);
          finishWaiting();
        }

        if (update.connection === 'close') {
          const statusCode = (
            update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
          )?.output?.statusCode;

          if (statusCode === DisconnectReason.loggedOut) {
            clearAuthFolder();
            activeSocket = null;
            sessionStatus = 'disconnected';
            currentQrDataUrl = null;
            connectedPhone = '';
            connectedName = '';
            lastError = 'WhatsApp session logged out. Scan a new QR code to reconnect.';
            finishWaiting();
            return;
          }

          if (
            statusCode === DisconnectReason.restartRequired ||
            (wasConnected && statusCode !== DisconnectReason.connectionReplaced)
          ) {
            sessionStatus = 'connecting';
            activeSocket = null;
            void launchSocket(gen);
            return;
          }

          activeSocket = null;
          sessionStatus = 'disconnected';
          currentQrDataUrl = null;
          lastError =
            statusCode === DisconnectReason.connectionReplaced
              ? 'WhatsApp Web session was replaced elsewhere.'
              : 'WhatsApp connection closed. Click Connect via QR to try again.';
          finishWaiting();
        }
      });
    } catch (err) {
      if (gen !== connectionGeneration) {
        finishWaiting();
        return;
      }
      sessionStatus = 'error';
      currentQrDataUrl = null;
      lastError =
        err instanceof Error ? err.message : 'Unable to start WhatsApp QR session.';
      finishWaiting();
    }
  };

  void launchSocket(myGen);

  const timeout = setTimeout(() => {
    finishWaiting();
  }, 10000);
  await waitForQrOrOpen;
  clearTimeout(timeout);

  return getWhatsAppSessionState();
}

export async function disconnectWhatsAppQrSession(): Promise<WhatsAppSessionSnapshot> {
  connectionGeneration += 1;
  const sock = activeSocket;
  activeSocket = null;
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // Ignore logout failure if socket wasn't fully open
    }
    try {
      sock.end(undefined);
    } catch {
      // Ignore socket close error
    }
  }
  clearAuthFolder();
  sessionStatus = 'disconnected';
  currentQrDataUrl = null;
  connectedPhone = '';
  connectedName = '';
  lastError = null;
  return getWhatsAppSessionState();
}

export async function sendWhatsAppViaQrSession(params: {
  to: string;
  jid?: string;
  body: string;
}): Promise<{ id: string }> {
  if (sessionStatus !== 'connected' || !activeSocket) {
    throw new Error('WhatsApp QR session is not connected.');
  }

  let targetJid = clampString(params.jid || '', 120);
  if (!targetJid || !targetJid.includes('@')) {
    const digits = params.to.replace(/\D/g, '');
    if (!digits) {
      throw new Error('Enter a valid phone number with country code (e.g. 15551234567).');
    }
    targetJid = `${digits}@s.whatsapp.net`;
  }

  const sent = await activeSocket.sendMessage(targetJid, { text: params.body });
  return { id: sent?.key?.id || 'wa_qr_sent' };
}
