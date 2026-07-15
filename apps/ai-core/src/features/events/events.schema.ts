import { z } from 'zod';

export const eventSchema = z.object({
  caseId: z.string().min(1),
  caseVersion: z.number().int().positive()
});

export type IncomingEvent = z.infer<typeof eventSchema>;
