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

  async extract(evidence: EvidenceItem[]): Promise<IdentityExtraction> {
    logStep('worker', 'groq identity extraction requested', {
      provider: 'groq',
      model: env.GROQ_IDENTITY_MODEL,
      evidence: countEvidence(evidence)
    });

    const response = await this.groqClient.createChatCompletion({
      model: env.GROQ_IDENTITY_MODEL,
      messages: [
        {
          role: 'user',
          content: buildPrompt(evidence)
        }
      ],
      temperature: 0.2,
      max_completion_tokens: 1024,
      reasoning_effort: 'low',
      include_reasoning: false,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'identity_intake_extraction',
          strict: true,
          schema: identityJsonSchema
        }
      }
    });

    const parsed = groqChatResponseSchema.parse(response);
    const content = parsed.choices[0]?.message.content ?? '{}';
    const extraction = normalizeExtractionSources(identityExtractionSchema.parse(JSON.parse(content)), evidence);

    logStep('worker', 'groq identity extraction received', extraction);

    return extraction;
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
    .map((item) => `[${item.type} ${item.sourceCaseVersionId}] ${item.content}`)
    .join('\n');

  return `Extrae exclusivamente estos datos de identidad para asistencia: poliza, nombre y apellido.

Reglas:
- No inventes datos.
- Si un dato no aparece o no es legible, usa value null, confidence 0 y source none.
- La poliza puede contener letras y numeros.
- Todos los mensajes pertenecen a la persona asegurada o solicitante; examina el contenido completo sin depender de su redaccion o tono.
- Extrae nombres aunque aparezcan en frases informales, saludos, texto con errores ortograficos o sin expresiones como "me llamo".
- Una declaracion explicita como "me llamo" o "mi nombre es" tiene prioridad sobre una mencion informal.
- Si hay valores distintos para el mismo dato, usa el valor explicitamente declarado mas reciente; si ninguno es explicito, usa la mencion mas reciente con mayor contexto.
- No corrijas ni reemplaces silenciosamente nombres poco comunes; conserva el valor escrito en la evidencia.
- Un solo nombre corresponde a firstName y deja lastName en null. Dos o mas palabras de nombre corresponden a firstName y lastName segun su orden natural.
- El source debe ser el canal original de la evidencia, no el formato intermedio.
- Usa source image si el dato viene de image_text, aunque image_text sea texto OCR.
- Usa source audio si el dato viene de audio_transcript, aunque audio_transcript sea una transcripcion.
- Usa source text solo si el dato viene de una evidencia tipo text.
- Usa source mixed solo si el mismo dato aparece en mas de un canal original.
- Devuelve solo el JSON que cumple el schema.

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
