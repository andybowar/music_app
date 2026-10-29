import vocabulary from '@/content/themes-v1.json';
import { themes as fixtureThemes } from '@/fixtures';
import type { ActionResult, Theme } from '@/types/domain';
import { normalizeThemeName, THEME_NAME_MAX } from '@/features/songs/ui/form/ThemesSection';

export interface FakeThemeApiOptions {
  /** Simulated network latency. */
  delayMs?: number;
  /** Read on every call so the gallery can flip it at runtime. */
  shouldFailSearch?: () => boolean;
}

export interface FakeThemeApi {
  searchThemes(prefix: string, limit?: number): Promise<Theme[]>;
  createTheme(name: string): Promise<ActionResult<Theme>>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const fakeId = (n: number) => `7f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Fixture themes plus the draft vocabulary (`content/themes-v1.json`), deduped by name. */
export function seedThemes(): Theme[] {
  const seeded: Theme[] = fixtureThemes.map((t) => ({ ...t }));
  const names = new Set(seeded.map((t) => t.name));
  let n = 1;
  for (const { name } of vocabulary as Array<{ name: string }>) {
    const normalized = normalizeThemeName(name);
    if (names.has(normalized)) continue;
    names.add(normalized);
    seeded.push({ id: fakeId(n++), name: normalized });
  }
  return seeded;
}

/**
 * In-memory stand-ins for api.md `searchThemes` / `createTheme`. Search matches the start of any
 * word in the name; create is idempotent on the normalized name, like the real action.
 */
export function createFakeThemeApi({
  delayMs = 300,
  shouldFailSearch = () => false,
}: FakeThemeApiOptions = {}): FakeThemeApi {
  const store = seedThemes();
  let nextId = 1000;

  return {
    async searchThemes(prefix, limit = 20) {
      await wait(delayMs);
      if (shouldFailSearch()) throw new Error('Simulated search failure');
      const p = normalizeThemeName(prefix);
      if (!p) return [];
      return store
        .filter((t) => t.name.startsWith(p) || t.name.split(' ').some((w) => w.startsWith(p)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, limit);
    },

    async createTheme(name) {
      await wait(delayMs);
      const normalized = normalizeThemeName(name);
      if (!normalized || normalized.length > THEME_NAME_MAX) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: `Theme names are 1 to ${THEME_NAME_MAX} characters`,
            fieldErrors: { name: ['Invalid'] },
          },
        };
      }
      const existing = store.find((t) => t.name === normalized);
      if (existing) return { ok: true, data: existing };
      const theme: Theme = { id: fakeId(nextId++), name: normalized };
      store.push(theme);
      return { ok: true, data: theme };
    },
  };
}
