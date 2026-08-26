import { z } from 'zod';
import { env } from '../../config/env';
import { GroqClient, summarizeGroqUsage } from '../../infra/groq/groq.client';
import { logStep } from '../../infra/logger/logger';
import type { DownloadedMedia } from './media-downloader.service';

const groqChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable()
      })
    })
  )
});

const imageOcrSchema = z.object({
  visibleText: z.union([z.string(), z.array(z.string())]),
  isLegible: z.boolean(),
  notes: z.string()
});

export class ImageOcrService {
  constructor(private readonly groqClient = new GroqClient()) {}

  async extractText(media: DownloadedMedia, correlationId?: string): Promise<string> {
    const prompt =
      'Transcribe literalmente el texto visible relacionado con poliza, nombre y apellido. Conserva valores raros o mal escritos; no corrijas, inventes ni completes informacion. Si nada es legible, usa visibleText vacio e isLegible false. Devuelve solo JSON con visibleText, isLegible y notes; visibleText debe ser un string.';
    const dataUrl = `data:${media.mimeType};base64,${media.buffer.toString('base64')}`;
    logStep('worker', 'groq request', {
      correlationId,
      operation: 'vision',
      model: env.GROQ_VISION_MODEL,
      mediaId: media.mediaId,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes
    });

    const response = await this.groqClient.createChatCompletion({
      model: env.GROQ_VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl }
            }
          ]
        }
      ],
      temperature: 0.2,
      max_completion_tokens: 1024,
      response_format: { type: 'json_object' }
    });

    const parsed = groqChatResponseSchema.parse(response);
    const content = parsed.choices[0]?.message.content ?? '{}';
    const result = imageOcrSchema.parse(JSON.parse(content));
    const visibleText = normalizeVisibleText(result.visibleText);

    logStep('worker', 'groq response', {
      correlationId,
      operation: 'vision',
      visibleText,
      isLegible: result.isLegible,
      usage: summarizeGroqUsage(response)
    });

    if (!result.isLegible) {
      return `Imagen no legible. Notas: ${result.notes}`;
    }

    return visibleText;
  }
}

function normalizeVisibleText(value: string | string[]) {
  return Array.isArray(value) ? value.join('\n') : value;
}
