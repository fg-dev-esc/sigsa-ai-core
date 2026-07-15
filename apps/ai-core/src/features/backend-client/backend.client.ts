import { env } from '../../config/env';
import { logStep } from '../../infra/logger/logger';
import { caseSchema } from './backend.schemas';
import type { BackendCase } from './backend.schemas';
import type { IdentityIntakeResult } from '../identity-intake/identity.types';

export class BackendClient {
  async getCase(caseId: string): Promise<BackendCase> {
    const url = buildBackendUrl(env.BACKEND_CASE_PATH, caseId);

    logStep('worker', 'backend case requested', {
      method: 'GET',
      url
    });

    const response = await fetch(url, {
      headers: this.authHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch case ${caseId}: ${response.status}`);
    }

    const body = await response.json();
    const caseData = caseSchema.parse(body);

    logStep('worker', 'backend case received', {
      status: response.status,
      caseId: caseData.caseId,
      caseVersion: caseData.caseVersion,
      messages: caseData.messages.map((message) => ({
        messageId: message.messageId,
        type: message.type,
        mediaId: message.type === 'text' ? undefined : message.media.mediaId
      }))
    });

    return caseData;
  }

  async postIdentityIntakeResult(result: IdentityIntakeResult): Promise<void> {
    const url = buildBackendUrl(env.BACKEND_RESULTS_PATH);

    logStep('worker', 'backend result requested', {
      method: 'POST',
      url,
      payload: {
        caseId: result.caseId,
        caseVersion: result.caseVersion,
        status: result.status,
        missing: result.missing,
        fields: result.fields
      }
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

    logStep('worker', 'backend result accepted', {
      status: response.status
    });
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
