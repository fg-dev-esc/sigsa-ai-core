import { z } from 'zod';

const textMessageSchema = z.object({
  caseVersionId: z.number().int().positive(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  type: z.literal('text'),
  text: z.string(),
  media: z.null().optional(),
  createdAt: z.string()
}).transform(({ caseVersionId, ...message }) => ({
  ...message,
  direction: 'inbound' as const,
  caseVersionId
}));

const mediaMessageSchema = z.object({
  caseVersionId: z.number().int().positive(),
  direction: z.enum(['inbound', 'outbound']).optional(),
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
}).transform(({ caseVersionId, ...message }) => ({
  ...message,
  direction: 'inbound' as const,
  caseVersionId
}));

export const caseSchema = z.object({
  caseId: z.string(),
  status: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  messages: z.array(z.union([textMessageSchema, mediaMessageSchema])).min(1)
}).transform((caseData) => ({
  ...caseData,
  caseVersionId: Math.max(...caseData.messages.map((message) => message.caseVersionId))
}));

export type BackendCase = z.infer<typeof caseSchema>;
export type BackendMessage = BackendCase['messages'][number];
