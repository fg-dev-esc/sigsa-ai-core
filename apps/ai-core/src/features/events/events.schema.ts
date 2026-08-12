import { z } from 'zod';

export const eventSchema = z.object({
  caseId: z.string().min(1)
});

export type IncomingEvent = z.infer<typeof eventSchema>;
