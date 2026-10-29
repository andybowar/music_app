import { describe, expect, it } from 'vitest';
import { themes } from '@/fixtures';
import { createFakeThemeApi, seedThemes } from './fakeThemeApi';

describe('createFakeThemeApi', () => {
  it('seeds fixture themes plus the vocabulary, normalized and deduped', () => {
    const seeded = seedThemes();
    expect(seeded.slice(0, themes.length)).toEqual(themes);
    const names = seeded.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n === n.trim().toLowerCase())).toBe(true);
    expect(names).toContain('god the father');
  });

  it('prefix-searches by any word, normalizing the query', async () => {
    const api = createFakeThemeApi({ delayMs: 0 });
    expect((await api.searchThemes('  GLO ')).map((t) => t.name)).toContain('glory');
    expect((await api.searchThemes('spirit')).map((t) => t.name)).toContain('holy spirit');
    expect(await api.searchThemes('   ')).toEqual([]);
    expect(await api.searchThemes('zzzz')).toEqual([]);
    expect(await api.searchThemes('a', 3)).toHaveLength(3);
  });

  it('fails search on demand', async () => {
    const api = createFakeThemeApi({ delayMs: 0, shouldFailSearch: () => true });
    await expect(api.searchThemes('glory')).rejects.toThrow();
  });

  it('creates idempotently on the normalized name and rejects bad names', async () => {
    const api = createFakeThemeApi({ delayMs: 0 });
    const created = await api.createTheme('  New   Theme ');
    expect(created).toMatchObject({ ok: true, data: { name: 'new theme' } });
    const again = await api.createTheme('NEW THEME');
    expect(again.ok && created.ok && again.data.id === created.data.id).toBe(true);
    const glory = await api.createTheme('Glory');
    expect(glory).toMatchObject({ ok: true, data: themes.find((t) => t.name === 'glory') });
    expect(await api.createTheme(' ')).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await api.createTheme('x'.repeat(61))).toMatchObject({ ok: false });
  });
});
