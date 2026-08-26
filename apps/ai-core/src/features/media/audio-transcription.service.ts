import { z } from 'zod';
import { env } from '../../config/env';
import { GroqClient } from '../../infra/groq/groq.client';
import { logStep } from '../../infra/logger/logger';
import type { DownloadedMedia } from './media-downloader.service';

const transcriptionSchema = z.object({
  text: z.string()
});

export class AudioTranscriptionService {
  constructor(private readonly groqClient = new GroqClient()) {}

  async transcribe(media: DownloadedMedia, correlationId?: string): Promise<string> {
    const prompt = 'Conversacion en español para capturar poliza, nombre y apellido.';
    logStep('worker', 'groq request', {
      correlationId,
      operation: 'transcription',
      request: {
        model: env.GROQ_TRANSCRIPTION_MODEL,
        mediaId: media.mediaId,
        mimeType: media.mimeType,
        filename: media.filename,
        sizeBytes: media.sizeBytes,
        language: 'es',
        temperature: 0,
        prompt
      }
    });

    const response = await this.groqClient.transcribeAudio({
      buffer: media.buffer,
      mimeType: media.mimeType,
      filename: media.filename,
      prompt
    });

    const text = transcriptionSchema.parse(response).text;

    logStep('worker', 'groq response', {
      correlationId,
      operation: 'transcription',
      response,
      text
    });

    return text;
  }
}
