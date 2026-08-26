import { env } from '../../config/env';
import { logStep } from '../../infra/logger/logger';

export type DownloadedMedia = {
  mediaId?: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
  sizeBytes: number;
};

export class MediaDownloaderService {
  async download(input: {
    mediaId?: string;
    downloadUrl: string;
    mimeType: string;
    sizeBytes: number;
    filename?: string;
    type: 'audio' | 'image' | 'document';
    correlationId?: string;
  }): Promise<DownloadedMedia> {
    const maxBytes = this.getMaxBytes(input.type);

    logStep('worker', 'media requested', {
      correlationId: input.correlationId,
      method: 'GET',
      url: input.downloadUrl,
      mediaId: input.mediaId,
      type: input.type
    });

    if (input.sizeBytes > maxBytes) {
      throw new Error(`Media exceeds max size for ${input.type}`);
    }

    const response = await fetch(input.downloadUrl);

    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.byteLength > maxBytes) {
      throw new Error(`Downloaded media exceeds max size for ${input.type}`);
    }

    const downloaded = {
      mediaId: input.mediaId,
      buffer,
      mimeType: response.headers.get('content-type') ?? input.mimeType,
      filename: input.filename ?? `media-${Date.now()}`,
      sizeBytes: buffer.byteLength
    };

    logStep('worker', 'media received', {
      correlationId: input.correlationId,
      status: response.status,
      mediaId: downloaded.mediaId,
      mimeType: downloaded.mimeType,
      sizeBytes: downloaded.sizeBytes
    });

    return downloaded;
  }

  private getMaxBytes(type: 'audio' | 'image' | 'document') {
    if (type === 'audio') return env.MAX_AUDIO_BYTES;
    if (type === 'image') return env.MAX_IMAGE_BYTES;
    return env.MAX_DOCUMENT_BYTES;
  }
}
