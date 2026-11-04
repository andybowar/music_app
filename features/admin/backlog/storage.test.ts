// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'test-key' } }));
vi.mock('@/lib/supabase/admin', () => ({
  createServiceSupabase: () => {
    throw new Error('unexpected Storage access');
  },
}));

const { decodePendingId, encodePendingId, requestImagePath, sniffImage } =
  await import('./storage');

const pending = {
  imageId: '10000000-0000-4000-8000-000000000001',
  requestId: '10000000-0000-4000-8000-000000000002',
  fileName: 'home page.png',
  mimeType: 'image/png' as const,
  sizeBytes: 1234,
  userId: '10000000-0000-4000-8000-000000000003',
  expiresAt: 2_000,
};

describe('pending upload ids', () => {
  it('round-trip', () => {
    expect(decodePendingId(encodePendingId(pending), 1_000)).toEqual(pending);
  });

  it('are refused once expired', () => {
    expect(decodePendingId(encodePendingId(pending), 2_001)).toBeNull();
  });

  it('are refused when tampered with or signed with another key', () => {
    const id = encodePendingId(pending);
    const [payload, sig] = id.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), s: 1 }),
    ).toString('base64url');
    expect(decodePendingId(`${forged}.${sig}`, 1_000)).toBeNull();
    expect(decodePendingId(encodePendingId(pending, 'other-key'), 1_000)).toBeNull();
    expect(decodePendingId(`${id}.extra`, 1_000)).toBeNull();
    expect(decodePendingId('nonsense', 1_000)).toBeNull();
  });
});

describe('requestImagePath', () => {
  it('is requests/{request}/{image}.{ext}', () => {
    expect(requestImagePath('r', 'i', 'image/jpeg')).toBe('requests/r/i.jpg');
    expect(requestImagePath('r', 'i', 'image/webp')).toBe('requests/r/i.webp');
  });
});

describe('sniffImage', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

  it('recognizes each signature', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png')).toBe(
      true,
    );
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg')).toBe(true);
    expect(sniffImage(bytes(...ascii('GIF89a')), 'image/gif')).toBe(true);
    expect(sniffImage(bytes(...ascii('GIF87a')), 'image/gif')).toBe(true);
    expect(sniffImage(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')), 'image/webp')).toBe(
      true,
    );
  });

  it('rejects mismatches', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff), 'image/png')).toBe(false);
    expect(sniffImage(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')), 'image/webp')).toBe(
      false,
    );
    expect(sniffImage(bytes(), 'image/gif')).toBe(false);
  });
});
