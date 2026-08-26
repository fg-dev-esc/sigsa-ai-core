import { z } from 'zod';
import { env } from '../../config/env';
import { GroqClient } from '../../infra/groq/groq.client';
import { logDebug, logStep } from '../../infra/logger/logger';
import type { DownloadedMedia } from './media-downloader.service';

const transcriptionSchema = z.object({
  text: z.string()
});

export class AudioTranscriptionService {
  constructor(private readonly groqClient = new GroqClient()) {}

  async transcribe(media: DownloadedMedia, correlationId?: string): Promise<string> {
    const prompt = 'Conversacion en español para capturar poliza, nombre y apellido.';
    logStep('worker', 'groq transcription requested', {
      provider: 'groq',
      model: env.GROQ_TRANSCRIPTION_MODEL,
      mediaId: media.mediaId,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      correlationId
    });

    logDebug('worker', 'groq transcription request', {
      correlationId,
      model: env.GROQ_TRANSCRIPTION_MODEL,
      mediaId: media.mediaId,
      mimeType: media.mimeType,
      filename: media.filename,
      sizeBytes: media.sizeBytes,
      language: 'es',
      temperature: 0,
      prompt
    });

    const response = await this.groqClient.transcribeAudio({
      buffer: media.buffer,
      mimeType: media.mimeType,
      filename: media.filename,
      prompt
    });

    logDebug('worker', 'groq transcription raw response', { correlationId, response });

    const text = transcriptionSchema.parse(response).text;

    logStep('worker', 'groq transcription received', {
      mediaId: media.mediaId,
      chars: text.length,
      preview: previewText(text),
      correlationId
    });

    logDebug('worker', 'groq transcription text', { correlationId, mediaId: media.mediaId, text });

    return text;
  }
}

function previewText(text: string) {
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}
