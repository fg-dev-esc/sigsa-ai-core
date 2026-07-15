import { z } from 'zod';

const textMessageSchema = z.object({
  messageId: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  type: z.literal('text'),
  text: z.string(),
  media: z.null().optional(),
  createdAt: z.string()
});

const mediaMessageSchema = z.object({
  messageId: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  type: z.enum(['audio', 'image', 'document']),
  text: z.null().optional(),
  media: z.object({
    mediaId: z.string().optional(),
    mimeType: z.string(),
    sizeBytes: z.number(),
    filename: z.string().optional(),
    downloadUrl: z.string().url()
  }),
  createdAt: z.string()
});

export const caseSchema = z.object({
  caseId: z.string(),
  caseVersion: z.number(),
  status: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  messages: z.array(z.union([textMessageSchema, mediaMessageSchema]))
});

export type BackendCase = z.infer<typeof caseSchema>;
export type BackendMessage = BackendCase['messages'][number];
