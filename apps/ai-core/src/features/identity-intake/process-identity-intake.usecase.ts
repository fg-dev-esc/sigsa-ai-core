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
    const caseData = await this.backendClient.getCase(job.caseId);

    logStep('worker', 'case loaded', {
      caseId: caseData.caseId,
      caseVersion: caseData.caseVersion,
      messages: caseData.messages.length
    });

    const evidence = await this.buildEvidence(caseData);

    logStep('worker', 'evidence built', countEvidence(evidence));

    const extraction = await this.identityExtraction.extract(evidence);

    const result = this.identityValidation.validate({
      caseId: caseData.caseId,
      caseVersion: job.caseVersion,
      extraction,
      correlationId: job.correlationId
    });

    logStep('worker', result.status === 'complete' ? 'checklist complete' : 'checklist needs_input', {
      caseId: result.caseId,
      status: result.status,
      missing: result.missing,
      fields: result.fields
    });

    await this.backendClient.postIdentityIntakeResult(result);

    logStep('worker', 'result sent', {
      caseId: result.caseId,
      endpoint: '/results'
    });
  }

  private async buildEvidence(caseData: BackendCase): Promise<EvidenceItem[]> {
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
        const item = await this.safeMediaEvidence(message, () => this.audioEvidence(message));
        if (item) evidence.push(item);
        continue;
      }

      if (message.type === 'image') {
        const item = await this.safeMediaEvidence(message, () => this.imageEvidence(message));
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

  private async safeMediaEvidence(message: MediaBackendMessage, build: () => Promise<EvidenceItem>) {
    try {
      return await build();
    } catch (error) {
      logError('worker', 'media evidence skipped', error, {
        messageId: message.messageId,
        type: message.type,
        mediaId: message.media.mediaId,
        downloadUrl: message.media.downloadUrl
      });

      return null;
    }
  }

  private async audioEvidence(message: MediaBackendMessage): Promise<EvidenceItem> {
    const media = await this.mediaDownloader.download({
      type: 'audio',
      mediaId: message.media.mediaId,
      downloadUrl: message.media.downloadUrl,
      mimeType: message.media.mimeType,
      sizeBytes: message.media.sizeBytes,
      filename: message.media.filename
    });
    const transcript = await this.audioTranscription.transcribe(media);

    return {
      id: `${message.messageId}:audio`,
      sourceMessageId: message.messageId,
      type: 'audio_transcript',
      content: transcript,
      createdAt: message.createdAt,
      mediaId: message.media.mediaId
    };
  }

  private async imageEvidence(message: MediaBackendMessage): Promise<EvidenceItem> {
    const media = await this.mediaDownloader.download({
      type: 'image',
      mediaId: message.media.mediaId,
      downloadUrl: message.media.downloadUrl,
      mimeType: message.media.mimeType,
      sizeBytes: message.media.sizeBytes,
      filename: message.media.filename
    });
    const text = await this.imageOcr.extractText(media);

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

function countEvidence(evidence: EvidenceItem[]) {
  return evidence.reduce(
    (acc, item) => {
      if (item.type === 'text') acc.text += 1;
      if (item.type === 'audio_transcript') acc.audio += 1;
      if (item.type === 'image_text') acc.image += 1;
      if (item.type === 'document_text') acc.document += 1;
      return acc;
    },
    { text: 0, audio: 0, image: 0, document: 0 }
  );
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
