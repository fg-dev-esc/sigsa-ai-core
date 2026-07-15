import { env } from '../../config/env';

type ChatCompletionRequest = {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content:
      | string
      | Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: { url: string } }
        >;
  }>;
  temperature?: number;
  max_completion_tokens?: number;
  response_format?: unknown;
  reasoning_effort?: 'low' | 'medium' | 'high';
  include_reasoning?: boolean;
};

export class GroqClient {
  async createChatCompletion(request: ChatCompletionRequest): Promise<unknown> {
    return this.postJson('/chat/completions', request);
  }

  async transcribeAudio(input: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
    prompt?: string;
  }): Promise<unknown> {
    const apiKey = this.getApiKey();
    const form = new FormData();
    const bytes = input.buffer.buffer.slice(
      input.buffer.byteOffset,
      input.buffer.byteOffset + input.buffer.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([bytes], { type: input.mimeType });

    form.append('file', blob, input.filename);
    form.append('model', env.GROQ_TRANSCRIPTION_MODEL);
    form.append('response_format', 'json');
    form.append('language', 'es');
    form.append('temperature', '0');

    if (input.prompt) {
      form.append('prompt', input.prompt);
    }

    const response = await fetch(`${env.GROQ_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    return this.parseResponse(response);
  }

  private async postJson(path: string, body: unknown): Promise<unknown> {
    const apiKey = this.getApiKey();
    const response = await fetch(`${env.GROQ_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    return this.parseResponse(response);
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Groq request failed: ${response.status} ${text}`);
    }

    return text ? JSON.parse(text) : {};
  }

  private getApiKey() {
    if (!env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is required for identity intake processing');
    }

    return env.GROQ_API_KEY;
  }
}
