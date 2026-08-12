export type EvidenceItem = {
  id: string;
  sourceMessageId: string;
  type: 'text' | 'audio_transcript' | 'image_text' | 'document_text';
  content: string;
  createdAt: string;
  mediaId?: string;
};

export type IdentityExtraction = {
  policyNumber: ExtractedIdentityField;
  firstName: ExtractedIdentityField;
  lastName: ExtractedIdentityField;
};

export type ExtractedIdentityField = {
  value: string | null;
  confidence: number;
  source: 'text' | 'audio' | 'image' | 'document' | 'mixed' | 'none';
};

export type IdentityFieldStatus = 'valid' | 'missing' | 'illegible' | 'invalid_length' | 'invalid_format';

export type IdentityValidatedField = {
  value: string | null;
  status: IdentityFieldStatus;
  confidence: number;
  source: ExtractedIdentityField['source'];
  reasonCode?: string;
};

export type IdentityIntakeResult = {
  caseId: string;
  caseVersionId: number;
  status: 'complete' | 'needs_input';
  fields: {
    policyNumber: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  missing: Array<'policyNumber' | 'firstName' | 'lastName'>;
  processedAt: string;
};
