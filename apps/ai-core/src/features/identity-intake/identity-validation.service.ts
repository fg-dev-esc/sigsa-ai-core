import { env } from '../../config/env';
import type {
  ExtractedIdentityField,
  IdentityExtraction,
  IdentityIntakeResult,
  IdentityValidatedField
} from './identity.types';

type FieldName = 'policyNumber' | 'firstName' | 'lastName';

export class IdentityValidationService {
  validate(input: {
    caseId: string;
    caseVersion: number;
    extraction: IdentityExtraction;
    correlationId: string;
  }): IdentityIntakeResult {
    const fields = {
      policyNumber: this.validatePolicy(input.extraction.policyNumber),
      firstName: this.validateName(input.extraction.firstName, 'FIRST_NAME'),
      lastName: this.validateName(input.extraction.lastName, 'LAST_NAME')
    };

    const missing = (Object.keys(fields) as FieldName[]).filter((field) => fields[field].status !== 'valid');
    return {
      caseId: input.caseId,
      caseVersion: input.caseVersion,
      status: missing.length === 0 ? 'complete' : 'needs_input',
      fields: {
        policyNumber: fields.policyNumber.value,
        firstName: fields.firstName.value,
        lastName: fields.lastName.value
      },
      missing,
      processedAt: new Date().toISOString()
    };
  }

  private validatePolicy(field: ExtractedIdentityField): IdentityValidatedField {
    const value = normalizePolicy(field.value);

    if (!value) {
      return invalid(field, null, 'missing', 'POLICY_NOT_FOUND');
    }

    if (field.confidence < env.IDENTITY_CONFIDENCE_THRESHOLD) {
      return invalid(field, value, 'illegible', 'POLICY_ILLEGIBLE');
    }

    if (value.length < env.POLICY_MIN_LENGTH || value.length > env.POLICY_MAX_LENGTH) {
      return invalid(field, value, 'invalid_length', 'POLICY_INVALID_LENGTH');
    }

    if (!/^[A-Z0-9]+$/.test(value)) {
      return invalid(field, value, 'invalid_format', 'POLICY_INVALID_FORMAT');
    }

    return valid(field, value);
  }

  private validateName(field: ExtractedIdentityField, prefix: 'FIRST_NAME' | 'LAST_NAME'): IdentityValidatedField {
    const value = normalizeName(field.value);

    if (!value) {
      return invalid(field, null, 'missing', `${prefix}_NOT_FOUND`);
    }

    if (field.confidence < env.IDENTITY_CONFIDENCE_THRESHOLD || value.length < env.NAME_MIN_LENGTH) {
      return invalid(field, value, 'illegible', `${prefix}_ILLEGIBLE`);
    }

    return valid(field, value);
  }
}

function valid(field: ExtractedIdentityField, value: string): IdentityValidatedField {
  return {
    value,
    status: 'valid',
    confidence: field.confidence,
    source: field.source
  };
}

function invalid(
  field: ExtractedIdentityField,
  value: string | null,
  status: IdentityValidatedField['status'],
  reasonCode: string
): IdentityValidatedField {
  return {
    value,
    status,
    confidence: field.confidence,
    source: field.source,
    reasonCode
  };
}

function normalizePolicy(value: string | null) {
  return value?.trim().toUpperCase().replace(/[\s-]/g, '') || null;
}

function normalizeName(value: string | null) {
  if (!value) return null;

  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'n')
    .replace(/[^a-zA-Z\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  return normalized || null;
}
