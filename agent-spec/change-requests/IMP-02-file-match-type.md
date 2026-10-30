# CR IMP-02 · `FileMatch` is used by the contract but never defined

**Status:** approved by project owner 2026-10-30. `contracts/api.md` updated.

## Problem

`contracts/api.md` gives `matchFiles(paths: string[], rows: ImportRow[]): { matched: FileMatch[]; unmatched: string[] }`,
but `FileMatch` is not defined in `contracts/types.md`, `types/domain.ts` or
`features/import/types.ts` (owned by IMP-01). IMP-02 owns only `features/import/match.ts`.

Workaround in IMP-02: `FileMatch` (and `MatchFilesResult`) are defined and exported from
`features/import/match.ts`. IMP-03 should import them from there:
`import { matchFiles, type FileMatch } from '@/features/import/match'`.

## Proposed diff

`contracts/api.md`, under the `matchFiles` signature, add:

```ts
// features/import/match.ts  (IMP-02) — FileMatch is exported from this module
export interface FileMatch {
  path: string;                       // as given
  idempotencyKey: string;             // matched ImportRow.idempotencyKey
  line: number;                       // matched ImportRow.line
  matchedOn: 'title' | 'alt_title';
  confidence: number;                 // 1 exact (normalized); [0.85, 1) fuzzy
  key: MusicalKey | null;             // null for projection
  keyInRow: boolean;                  // key is the row's primaryKey or in altKeys (true for projection)
  kind: ResourceKind;
  format: ResourceFormat;
  index: number;                      // <n> from "Chord Chart 2"; 1 when absent
  label: string;                      // "Chord Chart", "Chord Chart 2", "Projection"
}
```

Alternative: move `FileMatch` into `features/import/types.ts` (IMP-01's file) and re-export it
from `match.ts`. Either keeps the same shape.

## Affects

- IMP-02 (this task): already exports the type from `match.ts`.
- IMP-03 (import runner): consumes `FileMatch`; no change needed if it imports from `match.ts`.
