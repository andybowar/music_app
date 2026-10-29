import { samplePdfObjectUrl, sampleToneObjectUrl } from '@/components/media/sampleMedia';
import type { PutFile, ResourcesSectionProps } from '@/features/songs/ui/form/ResourcesSection';
import type { ActionResult, Resource, UUID } from '@/types/domain';
import { resourceLinkInputSchema, uploadRequestSchema } from '@/types/validation';

export type FailMode = 'none' | 'request' | 'upload' | 'finalize';

export interface FakeResourceApiOptions {
  /** Existing resources, so "open" knows each one's format. */
  seed?: Resource[];
  /** Simulated latency for each action. */
  delayMs?: number;
  /** Simulated upload duration. */
  uploadMs?: number;
  /** Read on every call so the gallery can flip it at runtime. */
  failMode?: () => FailMode;
  /** Builds the URL "open" returns; the gallery passes generated placeholder media. */
  mediaUrl?: (format: Resource['format']) => string;
}

export type FakeResourceApi = Pick<
  ResourcesSectionProps,
  | 'requestUpload'
  | 'finalizeUpload'
  | 'deleteResource'
  | 'getSignedResourceUrl'
  | 'addLink'
  | 'updateLink'
> & { putFile: PutFile };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const invalid = (fieldErrors: Record<string, string[]>): ActionResult<never> => ({
  ok: false,
  error: { code: 'VALIDATION', message: 'Check the highlighted fields', fieldErrors },
});

/** Placeholder media for "open": a generated PDF or tone, never a real file. */
export function placeholderMediaUrl(format: Resource['format']): string {
  if (format === 'pdf') return samplePdfObjectUrl();
  if (format === 'mp3' || format === 'm4a') return sampleToneObjectUrl();
  return 'data:text/plain,Placeholder%20projection%20file';
}

/**
 * In-memory stand-ins for the LIB-06 / LIB-07 resource actions. Inputs go through the real Zod
 * schemas; uploads tick progress over `uploadMs`. A link URL containing "reject" fails server
 * validation, to show field errors.
 */
export function createFakeResourceApi({
  seed = [],
  delayMs = 300,
  uploadMs = 1500,
  failMode = () => 'none',
  mediaUrl = () => 'about:blank',
}: FakeResourceApiOptions = {}): FakeResourceApi {
  const known = new Map<UUID, Resource>(seed.map((r) => [r.id, r]));
  const pending = new Map<UUID, Resource>();
  let seq = 0;
  const nextId = () => `9f000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const now = () => new Date().toISOString();

  const addLink: FakeResourceApi['addLink'] = async (input) => {
    await wait(delayMs);
    const parsed = resourceLinkInputSchema.safeParse(input);
    if (!parsed.success) return invalid({ form: parsed.error.issues.map((i) => i.message) });
    if (parsed.data.url.includes('reject')) return invalid({ url: ['Simulated: link rejected'] });
    const { songId, songKeyId, kind, label, url } = parsed.data;
    const row: Resource = {
      id: nextId(),
      songId,
      songKeyId,
      kind,
      format: 'url',
      label,
      url,
      storagePath: null,
      sizeBytes: null,
      mimeType: null,
      createdAt: now(),
    };
    known.set(row.id, row);
    return { ok: true, data: row };
  };

  return {
    async requestUpload(req) {
      await wait(delayMs);
      const parsed = uploadRequestSchema.safeParse(req);
      if (!parsed.success) return invalid({ form: parsed.error.issues.map((i) => i.message) });
      if (failMode() === 'request') {
        return { ok: false, error: { code: 'FORBIDDEN', message: 'Simulated: not allowed' } };
      }
      const r = parsed.data;
      const id = nextId();
      const path = `songs/${r.songId}/${r.songKeyId ?? 'common'}/${id}.${r.format}`;
      pending.set(id, {
        id,
        songId: r.songId,
        songKeyId: r.songKeyId,
        kind: r.kind,
        format: r.format,
        label: r.label,
        url: null,
        storagePath: path,
        sizeBytes: r.sizeBytes,
        mimeType: r.mimeType,
        createdAt: now(),
      });
      return {
        ok: true,
        data: { resourceId: id, uploadUrl: `https://storage.invalid/${path}`, path },
      };
    },

    async putFile(_url, _file, onProgress) {
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        await wait(uploadMs / steps);
        if (failMode() === 'upload' && i === 6) throw new Error('Simulated network error');
        onProgress(i / steps);
      }
    },

    async finalizeUpload(resourceId) {
      await wait(delayMs);
      const row = pending.get(resourceId);
      if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'Upload not found' } };
      if (failMode() === 'finalize') {
        return { ok: false, error: { code: 'INTERNAL', message: 'Simulated: finalize failed' } };
      }
      pending.delete(resourceId);
      known.set(row.id, row);
      return { ok: true, data: row };
    },

    async deleteResource(id) {
      await wait(delayMs);
      known.delete(id);
      return { ok: true, data: undefined };
    },

    async getSignedResourceUrl(id) {
      await wait(delayMs);
      const row = known.get(id);
      if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'File not found' } };
      const expiresAt = new Date(Date.now() + 3600_000).toISOString();
      return { ok: true, data: { url: mediaUrl(row.format), expiresAt } };
    },

    addLink,

    async updateLink(id, input) {
      const result = await addLink(input);
      if (!result.ok) return result;
      known.delete(result.data.id);
      const row = { ...result.data, id };
      known.set(id, row);
      return { ok: true, data: row };
    },
  };
}
