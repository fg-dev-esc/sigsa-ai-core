import { z } from 'zod';
import { env } from '../../config/env';
import { GroqClient } from '../../infra/groq/groq.client';
import { logStep } from '../../infra/logger/logger';
import type { EvidenceItem, ExtractedIdentityField, IdentityExtraction } from './identity.types';

const groqChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable()
      })
    })
  )
});

const extractedFieldSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['text', 'audio', 'image', 'document', 'mixed', 'none'])
});

const identityExtractionSchema = z.object({
  policyNumber: extractedFieldSchema,
  firstName: extractedFieldSchema,
  lastName: extractedFieldSchema
});

const identityJsonSchema = {
  type: 'object',
  properties: {
    policyNumber: fieldJsonSchema(),
    firstName: fieldJsonSchema(),
    lastName: fieldJsonSchema()
  },
  required: ['policyNumber', 'firstName', 'lastName'],
  additionalProperties: false
};

export class IdentityExtractionService {
  constructor(private readonly groqClient = new GroqClient()) {}

  async extract(evidence: EvidenceItem[], correlationId?: string): Promise<IdentityExtraction> {
    const prompt = buildPrompt(evidence);
    const request = {
      model: env.GROQ_IDENTITY_MODEL,
      messages: [
        {
          role: 'user' as const,
          content: prompt
        }
      ],
      temperature: 0.2,
      max_completion_tokens: 1024,
      reasoning_effort: 'low' as const,
      include_reasoning: false,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'identity_intake_extraction',
          strict: true,
          schema: identityJsonSchema
        }
      }
    };

    logStep('worker', 'groq request', {
      correlationId,
      operation: 'identity_extraction',
      request
    });

    const response = await this.groqClient.createChatCompletion(request);

    const parsed = groqChatResponseSchema.parse(response);
    const content = parsed.choices[0]?.message.content ?? '{}';
    const rawExtraction = identityExtractionSchema.parse(JSON.parse(content));
    const extraction = normalizeExtractionSources(rawExtraction, evidence);

    logStep('worker', 'groq response', {
      correlationId,
      operation: 'identity_extraction',
      response,
      content,
      rawExtraction,
      normalizedExtraction: extraction
    });

    return extraction;
  }
}

function fieldJsonSchema() {
  return {
    type: 'object',
    properties: {
      value: { type: ['string', 'null'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      source: { type: 'string', enum: ['text', 'audio', 'image', 'document', 'mixed', 'none'] }
    },
    required: ['value', 'confidence', 'source'],
    additionalProperties: false
  };
}

function buildPrompt(evidence: EvidenceItem[]) {
  const evidenceText = evidence
    .map((item) => `[${item.type} ${item.sourceMessageId}] ${item.content}`)
    .join('\n');

  return `Extrae literalmente poliza, nombre y apellido cuando esten claramente identificados.

Reglas:
- Conserva cada valor como aparece, aunque sea raro o este mal escrito.
- No corrijas, inventes, completes ni dividas informacion ambigua.
- Si un campo es insuficiente o contradictorio, usa value null, confidence 0 y source none.
- La poliza puede contener letras y numeros.
- Usa como source el canal original: text, audio, image, document o mixed.
- Devuelve solo el JSON solicitado.

Evidencia:
${evidenceText}`;
}

function normalizeExtractionSources(extraction: IdentityExtraction, evidence: EvidenceItem[]): IdentityExtraction {
  return {
    policyNumber: normalizeFieldSource(extraction.policyNumber, evidence),
    firstName: normalizeFieldSource(extraction.firstName, evidence),
    lastName: normalizeFieldSource(extraction.lastName, evidence)
  };
}

function normalizeFieldSource(field: ExtractedIdentityField, evidence: EvidenceItem[]): ExtractedIdentityField {
  if (!field.value) {
    return { ...field, source: 'none' };
  }

  const inferredSource = inferSource(field.value, evidence);

  if (!inferredSource) {
    return field;
  }

  return {
    ...field,
    source: inferredSource
  };
}

function inferSource(value: string, evidence: EvidenceItem[]): ExtractedIdentityField['source'] | null {
  const matchedSources = new Set<ExtractedIdentityField['source']>();

  for (const item of evidence) {
    if (evidenceContainsValue(item.content, value)) {
      matchedSources.add(sourceFromEvidenceType(item.type));
    }
  }

  if (matchedSources.size === 1) {
    return [...matchedSources][0];
  }

  if (matchedSources.size > 1) {
    return 'mixed';
  }

  const availableSources = new Set(evidence.map((item) => sourceFromEvidenceType(item.type)));

  if (availableSources.size === 1) {
    return [...availableSources][0];
  }

  return null;
}

function sourceFromEvidenceType(type: EvidenceItem['type']): ExtractedIdentityField['source'] {
  if (type === 'audio_transcript') return 'audio';
  if (type === 'image_text') return 'image';
  if (type === 'document_text') return 'document';
  return 'text';
}

function evidenceContainsValue(content: string, value: string) {
  const normalizedContent = normalizeForMatch(content);
  const normalizedValue = normalizeForMatch(value);

  return normalizedValue.length > 1 && normalizedContent.includes(normalizedValue);
}

function normalizeForMatch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'n')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}
