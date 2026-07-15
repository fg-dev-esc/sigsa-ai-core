import { z } from 'zod';
import { env } from '../../config/env';
import { GroqClient } from '../../infra/groq/groq.client';
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

  async extractText(media: DownloadedMedia): Promise<string> {
    logStep('worker', 'groq vision requested', {
      provider: 'groq',
      model: env.GROQ_VISION_MODEL,
      mediaId: media.mediaId,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes
    });

    const dataUrl = `data:${media.mimeType};base64,${media.buffer.toString('base64')}`;
    const response = await this.groqClient.createChatCompletion({
      model: env.GROQ_VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Lee esta imagen y extrae texto visible relacionado con poliza, nombre y apellido. Responde solo JSON con visibleText, isLegible y notes. visibleText debe ser un string, no un array.'
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

    logStep('worker', 'groq vision received', {
      mediaId: media.mediaId,
      legible: result.isLegible,
      chars: visibleText.length,
      preview: previewText(visibleText),
      notes: result.notes || undefined
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

function previewText(text: string) {
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}
