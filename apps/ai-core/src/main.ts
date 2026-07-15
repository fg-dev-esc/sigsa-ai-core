import { env } from './config/env';
import { createApp } from './app';
import { logStep } from './infra/logger/logger';
import { startIdentityIntakeWorker } from './workers/identity-intake.worker';

const app = createApp();
const worker = startIdentityIntakeWorker();
const port = env.PORT ?? env.AI_CORE_PORT;

const server = app.listen(port, () => {
  logStep('ai-core', 'listening', { port });
});

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  await Promise.all([
    worker.close(),
    new Promise<void>((resolve) => server.close(() => resolve()))
  ]);
}

process.on('SIGINT', () => {
  shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  shutdown().finally(() => process.exit(0));
});
