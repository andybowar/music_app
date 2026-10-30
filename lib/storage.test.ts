// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const bucket = {
  createSignedUploadUrl: vi.fn(),
  info: vi.fn(),
  createSignedUrl: vi.fn(),
  remove: vi.fn(),
};
const from = vi.fn(() => bucket);
vi.mock('@/lib/supabase/admin', () => ({
  createServiceSupabase: () => ({ storage: { from } }),
}));

const storage = await import('./storage');
const {
  canonicalMimeType,
  createUploadUrl,
  objectExists,
  readObjectHead,
  removeObject,
  resourcePath,
  signedReadUrl,
  sniffFormat,
} = storage;

const bytes = (...xs: Array<number | string>) =>
  new Uint8Array(
    xs.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])),
  );

beforeEach(() => {
  for (const fn of Object.values(bucket)) fn.mockReset();
  from.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe('resourcePath', () => {
  it('nests keyed files under the key', () => {
    expect(resourcePath('s1', 'k1', 'r1', 'pdf')).toBe('songs/s1/k1/r1.pdf');
  });
  it("uses 'common' for key-independent files", () => {
    expect(resourcePath('s1', null, 'r1', 'pptx')).toBe('songs/s1/common/r1.pptx');
  });
});

describe('sniffFormat', () => {
  it.each([
    ['pdf', bytes('%PDF-1.7\n')],
    ['mp3', bytes('ID3', 4, 0)],
    ['mp3', bytes(0xff, 0xfb, 0x90, 0x00)],
    ['m4a', bytes(0, 0, 0, 0x20, 'ftypM4A ')],
    ['ppt', bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0)],
    ['pptx', bytes('PK', 3, 4, 20)],
    ['mdb', bytes(0, 1, 0, 0, 'Standard Jet DB', 0)],
    ['mdb', bytes(0, 1, 0, 0, 'Standard ACE DB', 0)],
    ['pro', bytes(0x0a, 0x12, 0x01)],
  ] as const)('accepts a %s signature', (format, head) => {
    expect(sniffFormat(head, format)).toBe(true);
  });

  it.each([
    ['mp3', bytes('%PDF-1.7')],
    ['mp3', bytes(0xff, 0x10)],
    ['mp3', bytes(0xff)],
    ['pdf', bytes('ID3', 4)],
    ['m4a', bytes('ftyp')],
    ['ppt', bytes('PK', 3, 4)],
    ['pptx', bytes(0xd0, 0xcf, 0x11, 0xe0)],
    ['mdb', bytes(0, 1, 0, 0, 'Something else')],
  ] as const)('rejects a %s with the wrong signature', (format, head) => {
    expect(sniffFormat(head, format)).toBe(false);
  });

  it('rejects empty files of any format', () => {
    expect(sniffFormat(new Uint8Array(), 'pro')).toBe(false);
    expect(sniffFormat(new Uint8Array(), 'pdf')).toBe(false);
  });
});

describe('canonicalMimeType', () => {
  it('maps formats to MIME types', () => {
    expect(canonicalMimeType('pdf')).toBe('application/pdf');
    expect(canonicalMimeType('mp3')).toBe('audio/mpeg');
    expect(canonicalMimeType('pptx')).toMatch(/presentationml/);
  });
});

describe('storage calls', () => {
  const failure = Object.assign(new Error('boom'), { status: 500, statusCode: '500' });

  it('createUploadUrl returns the signed upload URL from the private bucket', async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://s/upload', token: 't', path: 'p' },
      error: null,
    });
    await expect(createUploadUrl('songs/a/b/c.pdf')).resolves.toBe('https://s/upload');
    expect(from).toHaveBeenCalledWith('resources');
    expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith('songs/a/b/c.pdf');
  });

  it('createUploadUrl throws storage errors', async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({ data: null, error: failure });
    await expect(createUploadUrl('p')).rejects.toBe(failure);
  });

  it('objectExists returns the size', async () => {
    bucket.info.mockResolvedValue({ data: { size: 1234 }, error: null });
    await expect(objectExists('p')).resolves.toEqual({ size: 1234 });
  });

  it('objectExists treats a missing size as 0', async () => {
    bucket.info.mockResolvedValue({ data: {}, error: null });
    await expect(objectExists('p')).resolves.toEqual({ size: 0 });
  });

  it.each([
    [{ status: 404 }],
    [{ status: 400, statusCode: '404' }],
    [{ status: 400, statusCode: 'not_found' }],
    [{ statusCode: '404' }],
  ])('objectExists returns null for not-found errors %j', async (fields) => {
    bucket.info.mockResolvedValue({ data: null, error: Object.assign(new Error('nf'), fields) });
    await expect(objectExists('p')).resolves.toBeNull();
  });

  it('objectExists throws other errors', async () => {
    bucket.info.mockResolvedValue({ data: null, error: failure });
    await expect(objectExists('p')).rejects.toBe(failure);
  });

  it('signedReadUrl defaults to SIGNED_URL_TTL_SECONDS', async () => {
    bucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://s/read' },
      error: null,
    });
    await expect(signedReadUrl('p')).resolves.toBe('https://s/read');
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('p', 3600);
    await signedReadUrl('p', 30);
    expect(bucket.createSignedUrl).toHaveBeenLastCalledWith('p', 30);
  });

  it('signedReadUrl throws storage errors', async () => {
    bucket.createSignedUrl.mockResolvedValue({ data: null, error: failure });
    await expect(signedReadUrl('p')).rejects.toBe(failure);
  });

  it('removeObject removes the single path and throws on error', async () => {
    bucket.remove.mockResolvedValue({ data: [], error: null });
    await expect(removeObject('p')).resolves.toBeUndefined();
    expect(bucket.remove).toHaveBeenCalledWith(['p']);
    bucket.remove.mockResolvedValue({ data: null, error: failure });
    await expect(removeObject('p')).rejects.toBe(failure);
  });

  it('readObjectHead does a ranged GET and trims to the requested length', async () => {
    bucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://s/read' },
      error: null,
    });
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4, 5, 6])));
    vi.stubGlobal('fetch', fetchMock);
    await expect(readObjectHead('p', 4)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('p', 60);
    expect(fetchMock).toHaveBeenCalledWith('https://s/read', { headers: { Range: 'bytes=0-3' } });
  });

  it('readObjectHead throws when the read fails', async () => {
    bucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://s/read' },
      error: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    await expect(readObjectHead('p')).rejects.toThrow(/403/);
  });
});
