export type CaseMessage =
  | {
      messageId: string;
      direction: 'inbound' | 'outbound';
      type: 'text';
      text: string;
      createdAt: string;
    }
  | {
      messageId: string;
      direction: 'inbound' | 'outbound';
      type: 'audio' | 'image' | 'document';
      media: {
        mediaId?: string;
        mimeType: string;
        sizeBytes: number;
        filename: string;
        downloadUrl: string;
      };
      createdAt: string;
    };

export type CaseFixture = {
  caseId: string;
  caseVersion: number;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
  messages: CaseMessage[];
};

export const cases: Record<string, CaseFixture> = {};
