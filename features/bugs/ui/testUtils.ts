import type { BugReportDetail, BugReportImage } from '../types';

export { pngFile, polyfillDom } from '@/features/admin/backlog/ui/testUtils';

export const T0 = '2026-11-01T12:00:00.000Z';

export function makeBugImage(n: number): BugReportImage {
  return {
    id: `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    reportId: '60000000-0000-4000-8000-000000000001',
    fileName: `screen-${n}.png`,
    mimeType: 'image/png',
    sizeBytes: 100,
    createdAt: T0,
    url: `https://storage.test/screen-${n}.png`,
  };
}

export function makeBug(overrides: Partial<BugReportDetail> = {}): BugReportDetail {
  const images = overrides.images ?? [];
  return {
    id: '60000000-0000-4000-8000-000000000001',
    title: 'Search is broken',
    description: 'First line\nSecond line',
    expected: 'Results',
    pagePath: '/library',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: '1280x800',
    appVersion: 'abcdef1234567890',
    status: 'new',
    adminNote: null,
    createdBy: 'u',
    createdByName: 'Mia Member',
    createdAt: T0,
    updatedAt: T0,
    imageCount: images.length,
    images,
    ...overrides,
  };
}
