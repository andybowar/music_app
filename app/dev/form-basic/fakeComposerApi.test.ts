import { describe, expect, it } from 'vitest';
import { composers } from '@/fixtures';
import { createFakeComposerApi } from './fakeComposerApi';

describe('createFakeComposerApi', () => {
  it('prefix-searches fixture composers by any word', async () => {
    const api = createFakeComposerApi({ delayMs: 0 });
    const first = composers[0];
    if (!first) throw new Error('fixtures have no composers');
    const lastWord = first.name.split(' ').at(-1) ?? first.name;
    expect(await api.searchComposers(lastWord.slice(0, 3).toUpperCase())).toContainEqual(first);
    expect(await api.searchComposers('   ')).toEqual([]);
    expect(await api.searchComposers('zzzz')).toEqual([]);
  });

  it('creates composers and rejects blanks and duplicates', async () => {
    const api = createFakeComposerApi({ delayMs: 0 });
    const created = await api.createComposer('  Test   Person ');
    expect(created).toMatchObject({ ok: true, data: { name: 'Test Person', popMember: 'none' } });
    expect(await api.searchComposers('test')).toHaveLength(1);
    expect(await api.createComposer('test person')).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(await api.createComposer(' ')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });

  it('fails search on demand', async () => {
    let fail = true;
    const api = createFakeComposerApi({ delayMs: 0, shouldFailSearch: () => fail });
    await expect(api.searchComposers('a')).rejects.toThrow();
    fail = false;
    await expect(api.searchComposers('a')).resolves.toBeInstanceOf(Array);
  });
});
