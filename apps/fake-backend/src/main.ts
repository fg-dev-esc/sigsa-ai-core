import { env } from './config/env';
import { createApp } from './app';
import { logStep } from './shared/logger';

const app = createApp();

app.listen(env.FAKE_BACKEND_PORT, () => {
  logStep('fake-backend', 'listening', { port: env.FAKE_BACKEND_PORT });
});
