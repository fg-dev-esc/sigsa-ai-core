import { env } from './config/env';
import { createApp } from './app';
import { logStep } from './infra/logger/logger';

const app = createApp();

app.listen(env.AI_CORE_PORT, () => {
  logStep('ai-core', 'listening', { port: env.AI_CORE_PORT });
});
