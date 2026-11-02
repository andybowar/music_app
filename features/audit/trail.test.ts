import { describe, expect, it } from 'vitest';

import { cleanDiff, collectRefs, type RefNames } from './trail';

const C1 = '10000000-0000-4000-8000-000000000001';
const C2 = '10000000-0000-4000-8000-000000000002';
const B1 = '20000000-0000-4000-8000-000000000001';

const refs: RefNames = {
  composers: new Map([[C1, 'Ann Writer']]),
  branches: new Map([[B1, 'SV']]),
};

describe('collectRefs', () => {
  it('gathers composer and branch ids from both sides, once each', () => {
    expect(
      collectRefs([
        { composerIds: { from: [C1], to: [C1, C2] }, addedByBranchId: { from: null, to: B1 } },
        { composerIds: { from: null, to: 'not a list' }, addedByBranchId: { from: B1, to: 7 } },
        { title: { from: 'a', to: 'b' } },
      ]),
    ).toEqual({ composerIds: [C1, C2], branchIds: [B1] });
  });

  it('ignores non-string ids', () => {
    expect(collectRefs([{ composerIds: { from: [1, C1], to: null } }])).toEqual({
      composerIds: [C1],
      branchIds: [],
    });
  });
});

describe('cleanDiff', () => {
  it('drops ids and storage details', () => {
    expect(
      cleanDiff(
        {
          songId: { from: null, to: 'x' },
          songKeyId: { from: null, to: 'y' },
          storagePath: { from: null, to: 'songs/x/y/z.pdf' },
          uploadedBy: { from: null, to: 'u' },
          sizeBytes: { from: null, to: 10 },
          mimeType: { from: null, to: 'application/pdf' },
          label: { from: null, to: 'Lead sheet' },
        },
        refs,
      ),
    ).toEqual({ label: { from: null, to: 'Lead sheet' } });
  });

  it('turns composer ids into names', () => {
    expect(cleanDiff({ composerIds: { from: [C1], to: [C1, C2] } }, refs)).toEqual({
      composers: { from: ['Ann Writer'], to: ['Ann Writer', 'Unknown composer'] },
    });
    expect(cleanDiff({ composerIds: { from: null, to: [C1] } }, refs)).toEqual({
      composers: { from: null, to: ['Ann Writer'] },
    });
  });

  it('turns the added-by branch id into its code', () => {
    expect(cleanDiff({ addedByBranchId: { from: B1, to: 'gone' } }, refs)).toEqual({
      addedByBranch: { from: 'SV', to: 'Unknown branch' },
    });
    expect(cleanDiff({ addedByBranchId: { from: null, to: B1 } }, refs)).toEqual({
      addedByBranch: { from: null, to: 'SV' },
    });
  });

  it('keeps only the lyric sections that changed', () => {
    expect(
      cleanDiff(
        {
          lyrics: {
            from: { chorus: 'a', verse_1: 'same', bridge: null },
            to: { chorus: 'b', verse_1: 'same', bridge: 'new' },
          },
        },
        refs,
      ),
    ).toEqual({
      lyrics: { from: { chorus: 'a', bridge: null }, to: { chorus: 'b', bridge: 'new' } },
    });
  });

  it('keeps non-empty sections when the song was created or deleted', () => {
    expect(cleanDiff({ lyrics: { from: null, to: { chorus: 'a', verse_1: null } } }, refs)).toEqual(
      { lyrics: { from: null, to: { chorus: 'a' } } },
    );
    expect(cleanDiff({ lyrics: { from: { chorus: 'a', verse_1: null }, to: null } }, refs)).toEqual(
      { lyrics: { from: { chorus: 'a' }, to: null } },
    );
  });

  it('drops lyrics with no real change and passes odd shapes through', () => {
    expect(cleanDiff({ lyrics: { from: { chorus: 'a' }, to: { chorus: 'a' } } }, refs)).toEqual({});
    expect(cleanDiff({ lyrics: { from: 'x', to: 'y' } }, refs)).toEqual({
      lyrics: { from: 'x', to: 'y' },
    });
  });

  it('defaults missing sides to null and skips malformed entries', () => {
    const odd = { year: { to: 2020 }, bad: 'nope' } as unknown as Parameters<typeof cleanDiff>[0];
    expect(cleanDiff(odd, refs)).toEqual({ year: { from: null, to: 2020 } });
  });
});
