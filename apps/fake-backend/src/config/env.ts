import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  FAKE_BACKEND_PORT: z.coerce.number().default(4000),
  AI_CORE_BASE_URL: z.string().url().default('http://localhost:3000'),
  BACKEND_SERVICE_TOKEN: z.string().default('dev-token')
});

export const env = envSchema.parse(process.env);
