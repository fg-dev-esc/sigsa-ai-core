export type MediaFixture = {
  mediaId: string;
  filePath: string;
  mimeType: string;
  filename: string;
};

export const mediaFixtures: Record<string, MediaFixture> = {};
