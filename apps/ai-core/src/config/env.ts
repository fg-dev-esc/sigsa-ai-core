import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().optional(),
  AI_CORE_PORT: z.coerce.number().default(3000),
  BACKEND_BASE_URL: z.string().url().default('http://localhost:4000'),
  BACKEND_CASE_PATH: z.string().default('/cases'),
  BACKEND_RESULTS_PATH: z.string().default('/results'),
  BACKEND_SERVICE_TOKEN: z.string().default('dev-token'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  GROQ_IDENTITY_MODEL: z.string().default('openai/gpt-oss-120b'),
  GROQ_TRANSCRIPTION_MODEL: z.string().default('whisper-large-v3-turbo'),
  GROQ_VISION_MODEL: z.string().default('meta-llama/llama-4-scout-17b-16e-instruct'),
  POLICY_MIN_LENGTH: z.coerce.number().default(8),
  POLICY_MAX_LENGTH: z.coerce.number().default(20),
  NAME_MIN_LENGTH: z.coerce.number().default(2),
  IDENTITY_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.7),
  MAX_IMAGE_BYTES: z.coerce.number().default(4 * 1024 * 1024),
  MAX_AUDIO_BYTES: z.coerce.number().default(25 * 1024 * 1024),
  MAX_DOCUMENT_BYTES: z.coerce.number().default(50 * 1024 * 1024),
  LOG_LEVEL: z.string().default('info')
});

export const env = envSchema.parse(process.env);
