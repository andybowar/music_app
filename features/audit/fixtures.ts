/**
 * Sample audit trail for the History tab gallery and tests (LIB-19). Shaped like what
 * `getAuditTrail('song', id)` returns: newest first, diffs already cleaned (see `trail.ts`).
 * Names come from `fixtures/users.json`; lyric text is invented placeholder text.
 */

import { SONG_IDS, getSong, users } from '@/fixtures';
import type { AuditEntry } from '@/types/domain';

const SONG = SONG_IDS.thousandHallelujahs;
const composerNames = getSong(SONG).composers.map((c) => c.name);
const name = (i: number) => users[i]?.name ?? 'Sample user';

export const AUDIT_FIXTURE_SONG_ID = SONG;

export const songAuditTrail: AuditEntry[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000009',
    actorName: name(1),
    entity: 'resource',
    entityId: 'a1000000-0000-4000-8000-000000000002',
    action: 'delete',
    diff: {
      kind: { from: 'audio', to: null },
      format: { from: 'mp3', to: null },
      label: { from: 'Rehearsal track', to: null },
    },
    createdAt: '2026-10-28T19:42:00.000Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000008',
    actorName: name(2),
    entity: 'branch_usage',
    entityId: SONG,
    action: 'update',
    diff: {
      OR: { from: null, to: { level: 'high', source: 'manual' } },
      SV: { from: { level: 'low', source: 'derived' }, to: { level: 'high', source: 'manual' } },
    },
    createdAt: '2026-10-21T15:05:00.000Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000007',
    actorName: name(1),
    entity: 'song_themes',
    entityId: SONG,
    action: 'update',
    diff: {
      chorus: { from: ['Praise'], to: ['Praise', 'Victory'] },
      bridge: { from: ['Surrender'], to: null },
    },
    createdAt: '2026-10-14T12:30:00.000Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000006',
    actorName: name(1),
    entity: 'song',
    entityId: SONG,
    action: 'update',
    diff: {
      tempoBpm: { from: 72, to: 76 },
      energyLevel: { from: 'mid_worship', to: 'high_worship' },
      energyNotes: { from: null, to: 'Build through the last chorus.' },
      lyrics: {
        from: { bridge: null },
        to: { bridge: '(sample bridge text)' },
      },
      arrangement: {
        from: ['verse_1', 'chorus', 'verse_2', 'chorus'],
        to: ['verse_1', 'chorus', 'verse_2', 'chorus', 'bridge', 'chorus'],
      },
    },
    createdAt: '2026-10-14T12:28:00.000Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000005',
    actorName: name(2),
    entity: 'song_key',
    entityId: 'a2000000-0000-4000-8000-000000000001',
    action: 'update',
    diff: { verseChord: { from: null, to: 'G' }, chorusChord: { from: 'C', to: 'Em' } },
    createdAt: '2026-10-02T09:10:00.000Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    actorName: name(2),
    entity: 'resource',
    entityId: 'a1000000-0000-4000-8000-000000000001',
    action: 'create',
    diff: {
      kind: { from: null, to: 'video_link' },
      format: { from: null, to: 'url' },
      label: { from: null, to: 'Live recording' },
      url: { from: null, to: 'https://example.com/live-recording' },
    },
    createdAt: '2026-09-30T18:00:00.000Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    actorName: name(2),
    entity: 'song_key',
    entityId: 'a2000000-0000-4000-8000-000000000002',
    action: 'create',
    diff: {
      key: { from: null, to: 'A' },
      isPrimary: { from: null, to: false },
      introChord: { from: null, to: 'A' },
    },
    createdAt: '2026-09-30T17:55:00.000Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    actorName: name(1),
    entity: 'song_composers',
    entityId: SONG,
    action: 'update',
    diff: { composers: { from: composerNames.slice(0, 1), to: composerNames } },
    createdAt: '2026-09-29T10:00:00.000Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    actorName: name(1),
    entity: 'song',
    entityId: SONG,
    action: 'create',
    diff: {
      title: { from: null, to: 'Thousand Hallelujahs' },
      year: { from: null, to: 2021 },
      timeSignature: { from: null, to: '4/4' },
      addedByBranch: { from: null, to: 'SV' },
      lyrics: { from: null, to: { chorus: '(sample chorus text)', verse_1: '(sample verse)' } },
    },
    createdAt: '2026-09-29T09:58:00.000Z',
  },
];
