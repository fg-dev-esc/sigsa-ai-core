import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { env } from './config/env';
import { cases, type CaseFixture, type CaseMessage } from './features/cases/cases.fixtures';
import { mediaFixtures } from './features/media/media.fixtures';
import { logError, logStep } from './shared/logger';

const DEMO_CASE_ID = 'CASE-DEMO-001';
const DEMO_PUBLIC_DIR = path.resolve(__dirname, '../public/whatsapp');
const DEMO_HTML_PATH = path.resolve(DEMO_PUBLIC_DIR, 'whatsapp.html');
const DEMO_STORAGE_DIR = path.resolve(__dirname, '../storage/demo', DEMO_CASE_ID);

type DemoMedia = {
  mediaId: string;
  filePath: string;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  type: 'audio' | 'image';
};

type DemoCaseSnapshot = {
  startIndex: number;
  endIndex: number;
};

type DemoState = {
  caseId: string;
  caseVersion: number;
  status: 'open';
  createdAt: string;
  updatedAt: string;
  backendMessages: CaseMessage[];
  uiMessages: CaseMessage[];
  media: Record<string, DemoMedia>;
  lastResult: unknown | null;
  lastResultCaseVersion: number;
  followUpFromMessageIndex: number;
  servedSnapshots: Record<string, DemoCaseSnapshot>;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 2
  }
});

const identityResults: unknown[] = [];
let demoState = createInitialDemoState();

export function createApp() {
  const app = express();

  ensureDemoStorage();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'fake-backend' });
  });

  app.get('/demo', (_req, res) => {
    res.sendFile(DEMO_HTML_PATH);
  });

  app.get('/whatsapp', (_req, res) => {
    res.sendFile(DEMO_HTML_PATH);
  });

  app.use('/whatsapp', express.static(DEMO_PUBLIC_DIR));
  app.use(express.static(DEMO_PUBLIC_DIR));

  app.get('/demo/cases/:caseId', (req, res) => {
    if (req.params.caseId !== DEMO_CASE_ID) {
      res.status(404).json({ error: 'demo_case_not_found' });
      return;
    }

    res.json({
      caseId: demoState.caseId,
      caseVersion: demoState.caseVersion,
      status: demoState.status,
      createdAt: demoState.createdAt,
      updatedAt: demoState.updatedAt,
      messages: demoState.uiMessages,
      lastResult: demoState.lastResult
    });
  });

  app.post('/demo/cases/:caseId/reset', (req, res) => {
    if (req.params.caseId !== DEMO_CASE_ID) {
      res.status(404).json({ error: 'demo_case_not_found' });
      return;
    }

    resetDemoState();

    logStep('fake-backend', 'demo case reset', {
      caseId: demoState.caseId,
      caseVersion: demoState.caseVersion
    });

    res.json({ reset: true, caseId: demoState.caseId });
  });

  app.post('/demo/messages', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
    try {
      const caseId = normalizeDemoCaseId(req.body?.caseId);
      const files = (req.files ?? {}) as Partial<Record<'image' | 'audio', Express.Multer.File[]>>;
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

      if (caseId !== DEMO_CASE_ID) {
        res.status(400).json({ error: 'invalid_demo_case' });
        return;
      }

      const addedMessages = appendDemoInboundMessages({
        text,
        image: files.image?.[0],
        audio: files.audio?.[0]
      });

      const aiCoreResult = await dispatchIdentityEvent(demoState.caseId, demoState.caseVersion);

      logStep('fake-backend', 'demo message accepted', {
        caseId: demoState.caseId,
        caseVersion: demoState.caseVersion,
        messagesAdded: addedMessages.length,
        aiCoreStatus: aiCoreResult.status
      });

      res.status(aiCoreResult.status).json({
        accepted: aiCoreResult.status >= 200 && aiCoreResult.status < 300,
        caseId: demoState.caseId,
        caseVersion: demoState.caseVersion,
        messagesAdded: addedMessages,
        sent: aiCoreResult.event,
        aiCoreResponse: aiCoreResult.body
      });
    } catch (error) {
      logError('fake-backend', 'demo message failed', error);
      res.status(500).json({ error: 'demo_message_failed' });
    }
  });

  app.get('/cases/:caseId', (req, res) => {
    const caseData = getCaseData(req.params.caseId);

    if (!caseData) {
      res.status(404).json({ error: 'case_not_found' });
      return;
    }

    logStep('fake-backend', 'case served', {
      caseId: caseData.caseId,
      caseVersion: caseData.caseVersion,
      messages: caseData.messages.length
    });

    res.json(caseData);
  });

  app.get('/media/:mediaId/download', (req, res) => {
    const media = getMedia(req.params.mediaId);

    if (!media || !fs.existsSync(media.filePath)) {
      res.status(404).json({ error: 'media_not_found' });
      return;
    }

    const stats = fs.statSync(media.filePath);

    logStep('fake-backend', 'media served', {
      mediaId: media.mediaId,
      mimeType: media.mimeType,
      filename: media.filename,
      sizeBytes: stats.size
    });

    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${media.filename}"`);
    fs.createReadStream(media.filePath).pipe(res);
  });

  app.post('/results', async (req, res) => {
    identityResults.push(req.body);

    logStep('fake-backend', 'identity result received', summarizeIdentityResult(req.body));

    if (req.body?.caseId === DEMO_CASE_ID) {
      await appendDemoResultMessage(req.body);
    }

    res.status(202).json({ accepted: true });
  });

  app.get('/identity-intake-results', (_req, res) => {
    res.json(identityResults);
  });

  app.post('/simulate-event', async (req, res) => {
    try {
      const caseId = typeof req.body?.caseId === 'string' ? req.body.caseId : DEMO_CASE_ID;
      const caseData = getCaseData(caseId);

      if (!caseData) {
        res.status(404).json({ error: 'case_not_found' });
        return;
      }

      logStep('fake-backend', 'simulate event', {
        caseId
      });

      const aiCoreResult = await dispatchIdentityEvent(caseId, caseData.caseVersion);

      logStep('fake-backend', 'ai-core response received', {
        status: aiCoreResult.status,
        response: aiCoreResult.body
      });

      res.status(aiCoreResult.status).json({ sent: aiCoreResult.event, aiCoreResponse: aiCoreResult.body });
    } catch (error) {
      logError('fake-backend', 'simulate event failed', error);
      res.status(500).json({ error: 'simulate_event_failed' });
    }
  });

  return app;
}

function createInitialDemoState(): DemoState {
  const now = new Date().toISOString();

  return {
    caseId: DEMO_CASE_ID,
    caseVersion: 1,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    backendMessages: [],
    uiMessages: [
      createTextMessage({
        direction: 'outbound',
        text: 'Hola, soy ESCOTEL ASISTENCIAS. Envía tu póliza, nombre y apellido por texto, audio o imagen.',
        createdAt: now
      })
    ],
    media: {},
    lastResult: null,
    lastResultCaseVersion: 0,
    followUpFromMessageIndex: 0,
    servedSnapshots: {}
  };
}

function resetDemoState() {
  fs.rmSync(DEMO_STORAGE_DIR, { recursive: true, force: true });
  ensureDemoStorage();
  demoState = createInitialDemoState();
}

function ensureDemoStorage() {
  fs.mkdirSync(path.join(DEMO_STORAGE_DIR, 'audio'), { recursive: true });
  fs.mkdirSync(path.join(DEMO_STORAGE_DIR, 'images'), { recursive: true });
}

function normalizeDemoCaseId(caseId: unknown) {
  return typeof caseId === 'string' && caseId.trim() ? caseId.trim() : DEMO_CASE_ID;
}

function appendDemoInboundMessages(input: {
  text: string;
  image?: Express.Multer.File;
  audio?: Express.Multer.File;
}) {
  const now = new Date().toISOString();
  const addedMessages: CaseMessage[] = [];

  if (input.text) {
    addedMessages.push(
      createTextMessage({
        direction: 'inbound',
        text: input.text,
        createdAt: now
      })
    );
  }

  if (input.image) {
    addedMessages.push(createMediaMessage(input.image, 'image', now));
  }

  if (input.audio) {
    addedMessages.push(createMediaMessage(input.audio, 'audio', now));
  }

  demoState.caseVersion += 1;
  demoState.updatedAt = now;
  demoState.backendMessages.push(...addedMessages);
  demoState.uiMessages.push(...addedMessages);

  return addedMessages;
}

function createTextMessage(input: { direction: 'inbound' | 'outbound'; text: string; createdAt: string }): CaseMessage {
  return {
    messageId: `MSG-DEMO-${crypto.randomUUID()}`,
    direction: input.direction,
    type: 'text',
    text: input.text,
    createdAt: input.createdAt
  };
}

function createMediaMessage(file: Express.Multer.File, type: 'image' | 'audio', createdAt: string): CaseMessage {
  const media = saveDemoMedia(file, type);

  return {
    messageId: `MSG-DEMO-${crypto.randomUUID()}`,
    direction: 'inbound',
    type,
    media: {
      mediaId: media.mediaId,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      filename: media.filename,
      downloadUrl: getMediaDownloadUrl(media.mediaId)
    },
    createdAt
  };
}

function saveDemoMedia(file: Express.Multer.File, type: 'image' | 'audio'): DemoMedia {
  const mediaId = `MEDIA-DEMO-${crypto.randomUUID()}`;
  const folder = type === 'image' ? 'images' : 'audio';
  const filename = `${mediaId}${getFileExtension(file, type)}`;
  const filePath = path.join(DEMO_STORAGE_DIR, folder, filename);
  const media = {
    mediaId,
    filePath,
    mimeType: file.mimetype || defaultMimeType(type),
    filename,
    sizeBytes: file.size,
    type
  };

  ensureDemoStorage();
  fs.writeFileSync(filePath, file.buffer);
  demoState.media[mediaId] = media;

  return media;
}

function getFileExtension(file: Express.Multer.File, type: 'image' | 'audio') {
  const originalExtension = path.extname(file.originalname || '').toLowerCase();

  if (originalExtension) return originalExtension;
  if (file.mimetype === 'image/png') return '.png';
  if (file.mimetype === 'image/webp') return '.webp';
  if (file.mimetype === 'audio/mpeg') return '.mp3';
  if (file.mimetype === 'audio/wav') return '.wav';
  if (file.mimetype === 'audio/ogg') return '.ogg';
  if (file.mimetype === 'audio/webm') return '.webm';

  return type === 'image' ? '.jpg' : '.webm';
}

function defaultMimeType(type: 'image' | 'audio') {
  return type === 'image' ? 'image/jpeg' : 'audio/webm';
}

function getMediaDownloadUrl(mediaId: string) {
  const baseUrl = (env.FAKE_BACKEND_PUBLIC_URL ?? `http://localhost:${env.FAKE_BACKEND_PORT}`).replace(/\/$/, '');

  return `${baseUrl}/media/${encodeURIComponent(mediaId)}/download`;
}

function getCaseData(caseId: string): CaseFixture | undefined {
  if (caseId === DEMO_CASE_ID) {
    const startIndex = Math.min(demoState.followUpFromMessageIndex, demoState.backendMessages.length);
    const messages = getDemoWorkerMessages(startIndex);

    demoState.servedSnapshots[String(demoState.caseVersion)] = {
      startIndex,
      endIndex: demoState.backendMessages.length
    };

    return {
      caseId: demoState.caseId,
      caseVersion: demoState.caseVersion,
      status: demoState.status,
      createdAt: demoState.createdAt,
      updatedAt: demoState.updatedAt,
      messages
    };
  }

  return cases[caseId] as CaseFixture | undefined;
}

function getDemoWorkerMessages(startIndex: number) {
  const newMessages = demoState.backendMessages.slice(startIndex);
  const contextMessage = createValidatedContextMessage();

  return contextMessage ? [contextMessage, ...newMessages] : newMessages;
}

function createValidatedContextMessage(): CaseMessage | null {
  const result = demoState.lastResult as any;

  if (!result || result.status !== 'needs_input') {
    return null;
  }

  const lines = ['Contexto validado por backend de mensajes anteriores. Usa estos datos como ya confirmados:'];

  if (result.fields?.policyNumber) {
    lines.push(`Poliza: ${result.fields.policyNumber}`);
  }

  if (result.fields?.firstName) {
    lines.push(`Nombre: ${result.fields.firstName}`);
  }

  if (result.fields?.lastName) {
    lines.push(`Apellido: ${result.fields.lastName}`);
  }

  if (lines.length === 1) {
    return null;
  }

  lines.push('Extrae los datos faltantes solo de los mensajes nuevos que siguen a este contexto.');

  return {
    messageId: `MSG-DEMO-CONTEXT-${demoState.caseVersion}`,
    direction: 'inbound',
    type: 'text',
    text: lines.join('\n'),
    createdAt: demoState.createdAt
  };
}

function getMedia(mediaId: string) {
  return demoState.media[mediaId] ?? mediaFixtures[mediaId];
}

async function dispatchIdentityEvent(caseId: string, caseVersion: number) {
  const event = {
    caseId,
    caseVersion
  };

  logStep('fake-backend', 'event dispatch requested', {
    caseId,
    caseVersion
  });

  const response = await fetch(`${env.AI_CORE_BASE_URL}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.BACKEND_SERVICE_TOKEN}`
    },
    body: JSON.stringify(event)
  });

  const body = await response.json().catch(() => ({}));

  return {
    event,
    status: response.status,
    body
  };
}

async function appendDemoResultMessage(result: any) {
  const now = new Date().toISOString();
  const resultCaseVersion = Number(result?.caseVersion ?? 0);

  if (resultCaseVersion > 0 && resultCaseVersion < demoState.lastResultCaseVersion) {
    logStep('fake-backend', 'stale demo result ignored', {
      caseId: result?.caseId,
      resultCaseVersion,
      lastResultCaseVersion: demoState.lastResultCaseVersion
    });
    return;
  }

  updateDemoFollowUpCursor(result);

  let text: string;

  if (result?.status === 'complete') {
    text = getCompleteMessage(result);
  } else {
    text = getNeedsInputMessage(result);
  }

  demoState.lastResult = result;
  demoState.lastResultCaseVersion = Math.max(demoState.lastResultCaseVersion, resultCaseVersion);
  demoState.updatedAt = now;
  demoState.uiMessages.push(
    createTextMessage({
      direction: 'outbound',
      text,
      createdAt: now
    })
  );
}

function getNeedsInputMessage(result: any) {
  const found: string[] = [];
  const missing: string[] = [];
  const missingFields = new Set(result?.missing ?? []);

  if (result.fields?.policyNumber && !missingFields.has('policyNumber')) found.push('tu póliza');
  else missing.push('*póliza*');

  if (result.fields?.firstName && !missingFields.has('firstName')) found.push('tu nombre');
  else missing.push('*nombre*');

  if (result.fields?.lastName && !missingFields.has('lastName')) found.push('tu apellido');
  else missing.push('*apellido*');

  if (found.length === 0) {
    return 'Necesito tu *póliza*, *nombre* y *apellido*. ¿Podrías enviarlos por foto, audio o texto?';
  }

  const foundText = joinItems(found);
  const missingText = joinItems(missing);
  const verb = missing.length === 1 ? 'falta' : 'faltan';

  const pronoun = missing.length === 1 ? 'enviarlo' : 'enviarlos';

  return `Listo, encontré ${foundText}, pero me ${verb} ${missingText}. ¿Podrías ${pronoun} por foto, audio o texto?`;
}

function joinItems(items: string[]) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items[0]}, ${items[1]} y ${items[2]}`;
}

function updateDemoFollowUpCursor(result: any) {
  const resultCaseVersion = Number(result?.caseVersion ?? 0);
  const snapshot = demoState.servedSnapshots[String(resultCaseVersion)];
  const endIndex = snapshot?.endIndex ?? demoState.backendMessages.length;

  demoState.followUpFromMessageIndex = Math.min(endIndex, demoState.backendMessages.length);

  logStep('fake-backend', 'demo follow-up cursor updated', {
    caseId: result?.caseId,
    resultCaseVersion,
    startIndex: snapshot?.startIndex ?? null,
    followUpFromMessageIndex: demoState.followUpFromMessageIndex,
    totalInboundMessages: demoState.backendMessages.length
  });
}

function getCompleteMessage(result: any) {
  return [
    'Datos recibidos correctamente:',
    `Póliza: ${result?.fields?.policyNumber ?? 'pendiente'}`,
    `Nombre: ${result?.fields?.firstName ?? 'pendiente'}`,
    `Apellido: ${result?.fields?.lastName ?? 'pendiente'}`
  ].join('\n');
}

function summarizeIdentityResult(result: any) {
  return {
    caseId: result?.caseId,
    caseVersion: result?.caseVersion,
    status: result?.status,
    fields: result?.fields,
    missing: result?.missing ?? []
  };
}
