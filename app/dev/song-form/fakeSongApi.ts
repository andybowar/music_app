import type { SongSaveActions } from '@/features/songs/ui/form/toInput';
import type { ActionResult, SongKey, UUID } from '@/types/domain';

/**
 * - `success`: every step saves.
 * - `field-errors`: `createSong` / `updateSong` fail validation with field errors on two tabs.
 * - `partial`: the song is created (or updated), then `setSongKeys` fails once; the next save
 *   succeeds and updates instead of creating again.
 */
export type SaveMode = 'success' | 'field-errors' | 'partial';

export interface FakeSongApiOptions {
  delayMs?: number;
  /** Read on every call so the gallery can flip it at runtime. */
  mode?: () => SaveMode;
}

export interface FakeSongApi extends SongSaveActions {
  /** Every call, newest last, so the gallery can show what was sent. */
  readonly calls: ReadonlyArray<{ action: keyof SongSaveActions; songId: UUID | null }>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

/** In-memory stand-ins for the LIB-01..LIB-05 save actions `SongForm` calls. */
export function createFakeSongApi({
  delayMs = 300,
  mode = () => 'success',
}: FakeSongApiOptions = {}): FakeSongApi {
  const calls: Array<{ action: keyof SongSaveActions; songId: UUID | null }> = [];
  let seq = 0;
  let keysFailedOnce = false;
  const id = (prefix: string) => `${prefix}-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  const fieldErrors = (): ActionResult<never> => ({
    ok: false,
    error: {
      code: 'VALIDATION',
      message: 'Invalid input.',
      fieldErrors: {
        title: ['Simulated: a song with this title already exists'],
        tempoBpm: ['Simulated: tempo is out of range'],
      },
    },
  });

  return {
    calls,

    async createSong() {
      calls.push({ action: 'createSong', songId: null });
      await wait(delayMs);
      if (mode() === 'field-errors') return fieldErrors();
      keysFailedOnce = false;
      return ok({ id: id('4f000000') });
    },

    async updateSong(songId) {
      calls.push({ action: 'updateSong', songId });
      await wait(delayMs);
      if (mode() === 'field-errors') return fieldErrors();
      return ok(undefined);
    },

    async setSongKeys(songId, keys) {
      calls.push({ action: 'setSongKeys', songId });
      await wait(delayMs);
      if (mode() === 'partial' && !keysFailedOnce) {
        keysFailedOnce = true;
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: 'Invalid keys.',
            fieldErrors: { '0.key': ['Simulated: this key could not be saved'] },
          },
        };
      }
      return ok(
        keys.map((k): SongKey => ({
          id: k.id ?? id('5f000000'),
          songId,
          key: k.key,
          isPrimary: k.isPrimary,
          firstChords: {
            intro: k.firstChords?.intro ?? null,
            verse: k.firstChords?.verse ?? null,
            chorus: k.firstChords?.chorus ?? null,
            bridge: k.firstChords?.bridge ?? null,
          },
        })),
      );
    },

    async setSongThemes(songId) {
      calls.push({ action: 'setSongThemes', songId });
      await wait(delayMs);
      return ok(undefined);
    },

    async setBranchUsage(songId) {
      calls.push({ action: 'setBranchUsage', songId });
      await wait(delayMs);
      return ok(undefined);
    },
  };
}
