# CR LIB-02: optional `id` on `SongKeyInput`

**Status:** proposed

## Problem
`setSongKeys(songId, keys)` is replace-all, but `songKeyInputSchema` (types/validation.ts,
owned by F-03) carries no row id. The action cannot tell a rename (G -> A) from "delete G,
add A", and a wrong guess either silently moves G's resources to A or bypasses the rule that
a key with resources cannot be deleted. Until this lands, LIB-02 only treats a change as a
rename when exactly one old key is removed and exactly one new key is added; anything else is
delete-plus-insert (CONFLICT if the removed key has resources).

## Proposed contract diff
```ts
export const songKeyInputSchema = z.object({
  id: uuid.optional(),   // existing song_keys.id; omit for a new key
  key: musicalKey,
  isPrimary: z.boolean(),
  firstChords: firstChordsSchema.default({}),
});
```
`SongKey.id` is already returned by `setSongKeys` / `getSong`, so the editor can echo it back.
Behaviour: entries with `id` match that row (rename or edit in place; an id not belonging to
the song is a VALIDATION error); entries without `id` match by key name, then fall back to
insert; unmatched existing rows are deleted (CONFLICT while they have resources). The
single-rename heuristic is then removed.

## Affects
F-03 (types/validation.ts), LIB-02 (keys.ts), LIB-17 and IMP-03 (callers).
