import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createEventsRouter } from './features/events/events.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'ai-core' });
  });

  app.get('/ready', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/events', createEventsRouter());

  return app;
}
