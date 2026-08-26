import { env } from '../../config/env';
import { logStep } from '../../infra/logger/logger';
import { caseSchema } from './backend.schemas';
import type { BackendCase } from './backend.schemas';
import type { IdentityIntakeResult } from '../identity-intake/identity.types';

export class BackendClient {
  async getCase(caseId: string, correlationId?: string): Promise<BackendCase> {
    const url = buildBackendUrl(env.BACKEND_CASE_PATH, caseId);

    logStep('worker', 'case requested', {
      correlationId,
      method: 'GET',
      url,
      caseId
    });

    const response = await fetch(url, {
      headers: this.authHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch case ${caseId}: ${response.status}`);
    }

    const body = await response.json();
    const caseData = caseSchema.parse(body);

    logStep('worker', 'case received', {
      correlationId,
      status: response.status,
      caseId: caseData.caseId,
      caseVersion: caseData.caseVersion,
      messages: caseData.messages.map((message) =>
        message.type === 'text'
          ? {
              messageId: message.messageId,
              direction: message.direction,
              type: message.type,
              text: message.text
            }
          : {
              messageId: message.messageId,
              direction: message.direction,
              type: message.type,
              mediaId: message.media.mediaId,
              mimeType: message.media.mimeType,
              sizeBytes: message.media.sizeBytes,
              downloadUrl: message.media.downloadUrl
            }
      )
    });

    return caseData;
  }

  async postIdentityIntakeResult(result: IdentityIntakeResult, correlationId?: string): Promise<number> {
    const url = buildBackendUrl(env.BACKEND_RESULTS_PATH);

    logStep('worker', 'result requested', {
      correlationId,
      method: 'POST',
      url,
      payload: result
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(result)
    });

    if (!response.ok) {
      throw new Error(`Failed to post identity intake result: ${response.status}`);
    }

    logStep('worker', 'result accepted', {
      correlationId,
      status: response.status,
      caseId: result.caseId,
      caseVersion: result.caseVersion
    });

    return response.status;
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${env.BACKEND_SERVICE_TOKEN}`
    };
  }
}

function buildBackendUrl(path: string, pathParam?: string) {
  const normalizedBaseUrl = env.BACKEND_BASE_URL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${normalizedBaseUrl}${normalizedPath}`;

  return pathParam ? `${url}/${encodeURIComponent(pathParam)}` : url;
}
