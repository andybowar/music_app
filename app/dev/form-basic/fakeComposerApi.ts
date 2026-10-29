import { composers as fixtureComposers } from '@/fixtures';
import type { ActionResult, Composer } from '@/types/domain';

export interface FakeComposerApiOptions {
  /** Simulated network latency. */
  delayMs?: number;
  /** Read on every call so the gallery can flip it at runtime. */
  shouldFailSearch?: () => boolean;
}

export interface FakeComposerApi {
  searchComposers(prefix: string): Promise<Composer[]>;
  createComposer(name: string): Promise<ActionResult<Composer>>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * In-memory stand-ins for api.md `searchComposers` / `createComposer`, seeded from `fixtures/`.
 * Search matches the start of any word in the name, case-insensitively (like the real prefix search).
 */
export function createFakeComposerApi({
  delayMs = 300,
  shouldFailSearch = () => false,
}: FakeComposerApiOptions = {}): FakeComposerApi {
  const store: Composer[] = fixtureComposers.map((c) => ({ ...c }));
  let nextId = 1;

  return {
    async searchComposers(prefix) {
      await wait(delayMs);
      if (shouldFailSearch()) throw new Error('Simulated search failure');
      const p = prefix.trim().toLowerCase();
      if (!p) return [];
      return store
        .filter((c) =>
          c.name
            .toLowerCase()
            .split(/\s+/)
            .some((word) => word.startsWith(p)),
        )
        .slice(0, 20);
    },

    async createComposer(name) {
      await wait(delayMs);
      const trimmed = name.trim().replace(/\s+/g, ' ');
      if (!trimmed) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: 'Enter a name',
            fieldErrors: { name: ['Required'] },
          },
        };
      }
      if (store.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
        return { ok: false, error: { code: 'CONFLICT', message: `${trimmed} already exists` } };
      }
      const composer: Composer = {
        id: `3f000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
        name: trimmed,
        popMember: 'none',
      };
      store.push(composer);
      return { ok: true, data: composer };
    },
  };
}
