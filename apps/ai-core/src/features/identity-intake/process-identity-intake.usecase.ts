import { BackendClient } from '../backend-client/backend.client';
import type { BackendCase, BackendMessage } from '../backend-client/backend.schemas';
import { logError, logStep } from '../../infra/logger/logger';
import { AudioTranscriptionService } from '../media/audio-transcription.service';
import { ImageOcrService } from '../media/image-ocr.service';
import { MediaDownloaderService } from '../media/media-downloader.service';
import { IdentityExtractionService } from './identity-extraction.service';
import type { IdentityIntakeJob } from './identity-intake.job';
import type { EvidenceItem } from './identity.types';
import { IdentityValidationService } from './identity-validation.service';

type MediaBackendMessage = Exclude<BackendMessage, { type: 'text' }>;

export class ProcessIdentityIntakeUseCase {
  constructor(
    private readonly backendClient = new BackendClient(),
    private readonly mediaDownloader = new MediaDownloaderService(),
    private readonly audioTranscription = new AudioTranscriptionService(),
    private readonly imageOcr = new ImageOcrService(),
    private readonly identityExtraction = new IdentityExtractionService(),
    private readonly identityValidation = new IdentityValidationService()
  ) {}

  async execute(job: IdentityIntakeJob): Promise<void> {
    const caseData = await this.backendClient.getCase(job.caseId, job.correlationId);
    const evidence = await this.buildEvidence(caseData, job.correlationId);

    logStep('worker', 'input prepared', {
      caseId: caseData.caseId,
      caseVersion: caseData.caseVersion,
      correlationId: job.correlationId,
      evidence: evidence.map((item) => ({
        type: item.type,
        content: item.content
      }))
    });

    const extraction = await this.identityExtraction.extract(evidence, job.correlationId);

    const result = this.identityValidation.validate({
      caseId: caseData.caseId,
      caseVersion: job.caseVersion,
      extraction,
      correlationId: job.correlationId
    });

    logStep('worker', 'identity validated', {
      correlationId: job.correlationId,
      caseId: result.caseId,
      status: result.status,
      fields: result.fields,
      missing: result.missing
    });

    await this.backendClient.postIdentityIntakeResult(result, job.correlationId);
  }

  private async buildEvidence(caseData: BackendCase, correlationId: string): Promise<EvidenceItem[]> {
    const evidence: EvidenceItem[] = [];
    const messages = [...caseData.messages]
      .filter((message) => message.direction === 'inbound')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    for (const message of messages) {
      if (message.type === 'text') {
        evidence.push(textEvidence(message));
        continue;
      }

      if (message.type === 'audio') {
        const item = await this.safeMediaEvidence(message, correlationId, () => this.audioEvidence(message, correlationId));
        if (item) evidence.push(item);
        continue;
      }

      if (message.type === 'image') {
        const item = await this.safeMediaEvidence(message, correlationId, () => this.imageEvidence(message, correlationId));
        if (item) evidence.push(item);
        continue;
      }

      evidence.push({
        id: `${message.messageId}:document`,
        sourceMessageId: message.messageId,
        type: 'document_text',
        content: 'Document processing is not enabled in identity intake phase 1.',
        createdAt: message.createdAt,
        mediaId: message.media.mediaId
      });
    }

    return evidence;
  }

  private async safeMediaEvidence(
    message: MediaBackendMessage,
    correlationId: string,
    build: () => Promise<EvidenceItem>
  ) {
    try {
      return await build();
    } catch (error) {
      logError('worker', 'media evidence skipped', error, {
        correlationId,
        messageId: message.messageId,
        type: message.type,
        mediaId: message.media.mediaId,
        downloadUrl: message.media.downloadUrl
      });

      return null;
    }
  }

  private async audioEvidence(message: MediaBackendMessage, correlationId: string): Promise<EvidenceItem> {
    const media = await this.mediaDownloader.download({
      type: 'audio',
        mediaId: message.media.mediaId,
        downloadUrl: message.media.downloadUrl,
        mimeType: message.media.mimeType,
        sizeBytes: message.media.sizeBytes,
        filename: message.media.filename,
        correlationId
    });
    const transcript = await this.audioTranscription.transcribe(media, correlationId);

    return {
      id: `${message.messageId}:audio`,
      sourceMessageId: message.messageId,
      type: 'audio_transcript',
      content: transcript,
      createdAt: message.createdAt,
      mediaId: message.media.mediaId
    };
  }

  private async imageEvidence(message: MediaBackendMessage, correlationId: string): Promise<EvidenceItem> {
    const media = await this.mediaDownloader.download({
      type: 'image',
      mediaId: message.media.mediaId,
      downloadUrl: message.media.downloadUrl,
      mimeType: message.media.mimeType,
      sizeBytes: message.media.sizeBytes,
      filename: message.media.filename,
      correlationId
    });
    const text = await this.imageOcr.extractText(media, correlationId);

    return {
      id: `${message.messageId}:image`,
      sourceMessageId: message.messageId,
      type: 'image_text',
      content: text,
      createdAt: message.createdAt,
      mediaId: message.media.mediaId
    };
  }
}

function textEvidence(message: Extract<BackendMessage, { type: 'text' }>): EvidenceItem {
  return {
    id: `${message.messageId}:text`,
    sourceMessageId: message.messageId,
    type: 'text',
    content: message.text,
    createdAt: message.createdAt
  };
}
