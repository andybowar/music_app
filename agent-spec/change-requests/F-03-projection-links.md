# CR F-03 · Projection resources can be links

**Status:** approved 2026-10-28 by the project owner; contract updated in this commit.

## Problem

`contracts/types.md` said `resourceLinkInputSchema` takes a `songKeyId` "required unless kind=projection", but `KIND_FORMATS.projection` had no `'url'`, so a projection link could never pass validation. Projection files need no key (REQ-LIB-10), and a projection resource may also be a link (shared drive, online slide deck).

## Contract diff

`contracts/types.md`:

```diff
-  projection: ['pro', 'mdb', 'ppt', 'pptx'],
+  projection: ['pro', 'mdb', 'ppt', 'pptx', 'url'],
```

```diff
-| `resourceLinkInputSchema` | `songId`, `songKeyId` (required unless kind=projection), `kind`, `label` 1–120, `url` http(s) |
+| `resourceLinkInputSchema` | `songId`, `songKeyId` (required unless kind=projection; must be null for projection), `kind` (must allow `'url'` in `KIND_FORMATS`), `label` 1–120, `url` http(s) |
```

`SPEC.md`: REQ-LIB-10 allows projection links; REQ-ROW-04 says projection links open in a new tab.

`contracts/schema.md`: no change. The existing checks already allow a key-less `format='url'` projection row (`(format = 'url') = (url is not null)`, `(kind = 'projection') = (song_key_id is null)`).

## Affects

- **F-03** (in review): `types/domain.ts` picks up the new `KIND_FORMATS`; the "projection link is rejected" test flips to accepted.
- **LIB-07** `addLink`: accept `kind='projection'` with `songKeyId = null`.
- **LIB-14**: the "Projection (any key)" block accepts links as well as uploads (task file updated).
- **UI-07 / LIB-18**: the Projection group lists links; opening one goes to the URL in a new tab instead of downloading.
- **IMP-01 / IMP-02**: no change (the import format only carries files).
