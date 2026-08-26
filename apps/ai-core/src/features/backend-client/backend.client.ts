import { env } from '../../config/env';
import { caseSchema } from './backend.schemas';
import type { BackendCase } from './backend.schemas';
import type { IdentityIntakeResult } from '../identity-intake/identity.types';

export class BackendClient {
  async getCase(caseId: string): Promise<BackendCase> {
    const url = buildBackendUrl(env.BACKEND_CASE_PATH, caseId);

    const response = await fetch(url, {
      headers: this.authHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch case ${caseId}: ${response.status}`);
    }

    const body = await response.json();
    const caseData = caseSchema.parse(body);

    return caseData;
  }

  async postIdentityIntakeResult(result: IdentityIntakeResult): Promise<number> {
    const url = buildBackendUrl(env.BACKEND_RESULTS_PATH);

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
