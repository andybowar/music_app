import { describe, expect, it } from 'vitest';
import { BRANCH_IDS, getSong, SONG_IDS } from '@/fixtures';
import { createFakeUsageApi } from './fakeUsageApi';

const song = getSong(SONG_IDS.tenThousandReasons); // CO Springs derived

describe('createFakeUsageApi', () => {
  it('replaces manual rows and keeps derived rows unless overridden', async () => {
    const api = createFakeUsageApi(song.usage, { delayMs: 0 });
    expect(
      await api.setBranchUsage(song.id, [{ branchId: BRANCH_IDS.servant, level: 'rare' }]),
    ).toEqual({ ok: true, data: undefined });
    expect(api.stored).toEqual([
      { branchId: BRANCH_IDS.coSprings, branchCode: 'CO', level: 'high', source: 'derived' },
      { branchId: BRANCH_IDS.servant, branchCode: 'SV', level: 'rare', source: 'manual' },
    ]);
    await api.setBranchUsage(song.id, [{ branchId: BRANCH_IDS.coSprings, level: 'low' }]);
    expect(api.stored).toEqual([
      { branchId: BRANCH_IDS.coSprings, branchCode: 'CO', level: 'low', source: 'manual' },
    ]);
  });

  it('returns field errors for invalid input and when told to fail', async () => {
    const api = createFakeUsageApi([], { delayMs: 0, shouldFail: () => true });
    const dup = await api.setBranchUsage(song.id, [
      { branchId: BRANCH_IDS.servant, level: 'high' },
      { branchId: BRANCH_IDS.servant, level: 'low' },
    ]);
    expect(dup).toMatchObject({
      ok: false,
      error: { fieldErrors: { 'usage.1.branchId': ['Duplicate branch'] } },
    });
    const failed = await api.setBranchUsage(song.id, [
      { branchId: BRANCH_IDS.servant, level: 'high' },
    ]);
    expect(failed).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(api.stored).toEqual([]);
  });
});
