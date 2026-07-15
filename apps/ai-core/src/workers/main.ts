import { startIdentityIntakeWorker } from './identity-intake.worker';

const worker = startIdentityIntakeWorker();

async function shutdown() {
  await worker.close();
}

process.on('SIGINT', () => {
  shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  shutdown().finally(() => process.exit(0));
});
