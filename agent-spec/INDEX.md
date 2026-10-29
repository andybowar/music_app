# Task index

96 tasks · 13 waves · 4 human-required · sizes: S ≤ ½ day, M ≈ 1 day, L ≈ 2 days of focused agent work.

**How to use.** A task is *ready* when every task in `depends_on` is merged. All ready tasks in a wave can run at the same time — their `owns` paths never overlap (checked by `scripts/check_tasks.py`). Start a task by setting `status: in_progress` in its file; see `AGENTS.md` for the full protocol.

This file is a generated snapshot (`scripts/gen_index.py`). The `status:` field in each task file is the source of truth.

## Critical path

F-01 → F-03 → DB-01 → DB-03 → DB-07 → AUTH-04 → LIB-01 → LIST-01 → LIST-07 → PLAY-05 → SHR-04 → H-05 → PILOT-01  (≈ 15 agent-days; everything else runs alongside)

## Waves

### Wave 1 — 2 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [F-01](tasks/F-01.md) | Repo scaffold | 0 Foundations | platform | M | — |
| [OPS-01](tasks/OPS-01.md) 👤 | Provision cloud environments | 0 Foundations | ops | S | — |

### Wave 2 — 4 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [F-02](tasks/F-02.md) | CI pipeline | 0 Foundations | platform | S | F-01 |
| [F-03](tasks/F-03.md) | Domain types + Zod validation | 0 Foundations | platform | M | F-01 |
| [F-05](tasks/F-05.md) | Env + Supabase clients | 0 Foundations | platform | S | F-01 |
| [OPS-03](tasks/OPS-03.md) 👤 | Backups, restore drill, quota alerts | 5 Hardening | ops | S | OPS-01 |

### Wave 3 — 9 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [AUTH-05](tasks/AUTH-05.md) | Permissions helper | 0 Foundations | security | S | F-03 |
| [DB-01](tasks/DB-01.md) | Drizzle schema + initial migration | 0 Foundations | data | M | F-03 |
| [F-04](tasks/F-04.md) | Fixtures | 0 Foundations | platform | M | F-03 |
| [IMP-01](tasks/IMP-01.md) | Import CSV parser | 1 Library | data | M | F-03 |
| [LIB-16](tasks/LIB-16.md) | Lyrics paste-and-split parser | 1 Library | backend | S | F-03 |
| [LIST-04](tasks/LIST-04.md) | Current list context | 3 Lists | frontend | S | F-03 |
| [PLAY-01](tasks/PLAY-01.md) | Player engine (pure reducer) | 3 Lists | frontend | S | F-03 |
| [SRCH-04](tasks/SRCH-04.md) | useSearchState (URL-backed) | 2 Search | frontend | S | F-03 |
| [UI-01](tasks/UI-01.md) | Design tokens + UI primitives | 0 Foundations | frontend | M | F-01, F-03 |

### Wave 4 — 19 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [AUTH-01](tasks/AUTH-01.md) | Password login, logout, reset | 0 Foundations | auth | M | F-05, UI-01 |
| [CNT-01](tasks/CNT-01.md) | Theme vocabulary v1 (draft) | 1 Library | content | S | F-04 |
| [DB-02](tasks/DB-02.md) | Search triggers + indexes | 0 Foundations | data | M | DB-01 |
| [DB-03](tasks/DB-03.md) | RLS policies | 0 Foundations | security | M | DB-01 |
| [DB-04](tasks/DB-04.md) | Seed script | 0 Foundations | data | S | DB-01, F-04 |
| [DB-06](tasks/DB-06.md) | DB client, action wrapper, audit helper | 0 Foundations | platform | S | DB-01, F-05 |
| [IMP-02](tasks/IMP-02.md) | Import file matcher | 1 Library | data | S | F-03, IMP-01 |
| [LIB-10](tasks/LIB-10.md) | Song form: Basic info section | 1 Library | frontend | M | UI-01, F-04 |
| [LIST-03](tasks/LIST-03.md) | Override resolution (pure) | 3 Lists | backend | S | F-03, F-04 |
| [LIST-05](tasks/LIST-05.md) | CreateListDialog | 3 Lists | frontend | S | UI-01, F-03 |
| [PLAY-02](tasks/PLAY-02.md) | MP3 adapter | 3 Lists | frontend | S | PLAY-01 |
| [PLAY-03](tasks/PLAY-03.md) | YouTube adapter | 3 Lists | frontend | S | PLAY-01 |
| [PLAY-04](tasks/PLAY-04.md) | PlayerBar UI | 3 Lists | frontend | S | UI-01, PLAY-01 |
| [PLAY-06](tasks/PLAY-06.md) | AudioPicker | 3 Lists | frontend | S | UI-01, F-03 |
| [SRCH-05](tasks/SRCH-05.md) | SearchBar with field toggles | 2 Search | frontend | S | UI-01, SRCH-04 |
| [SRCH-07](tasks/SRCH-07.md) | SortControl | 2 Search | frontend | S | UI-01, SRCH-04 |
| [UI-02](tasks/UI-02.md) | App shell + NavBar | 0 Foundations | frontend | M | UI-01, F-04 |
| [UI-04](tasks/UI-04.md) | Song atoms (EnergyChip, KeyBadge, TimeSig, ComposerName, BranchCode) | 1 Library | frontend | S | UI-01, F-04 |
| [UI-08](tasks/UI-08.md) | PdfViewer + InlineAudio | 1 Library | frontend | S | UI-01 |

### Wave 5 — 15 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [AUTH-02](tasks/AUTH-02.md) | OIDC SSO (Google, Microsoft) + user provisioning | 0 Foundations | auth | M | AUTH-01, DB-06 |
| [CNT-02](tasks/CNT-02.md) | Tagging guide | 1 Library | content | S | CNT-01 |
| [DB-07](tasks/DB-07.md) | User access status (approval) migration | 0 Foundations | data | M | DB-03, DB-04, F-03, F-04 |
| [LIB-11](tasks/LIB-11.md) | Song form: Musical tags section | 1 Library | frontend | M | UI-04, LIB-10 |
| [LIB-12](tasks/LIB-12.md) | Song form: Lyrics section (chorus, verses 1–5, bridge) | 1 Library | frontend | M | LIB-10, LIB-16 |
| [LIB-13](tasks/LIB-13.md) | Song form: Themes section | 1 Library | frontend | S | LIB-10 |
| [LIB-14](tasks/LIB-14.md) | Song form: Files & links section | 1 Library | frontend | M | LIB-10, UI-08 |
| [LIB-15](tasks/LIB-15.md) | Song form: Branch usage section | 1 Library | frontend | S | LIB-10 |
| [LIST-06](tasks/LIST-06.md) | AddToListMenu | 3 Lists | frontend | S | UI-01, LIST-05 |
| [OPS-02](tasks/OPS-02.md) | Sentry + structured logging | 5 Hardening | ops | S | F-01, DB-06 |
| [SRCH-01](tasks/SRCH-01.md) | Search query builder | 2 Search | backend | L | DB-02, DB-04, DB-06 |
| [SRCH-06](tasks/SRCH-06.md) | FilterBar (concurrent dropdowns) | 2 Search | frontend | M | UI-04, SRCH-04 |
| [UI-05](tasks/UI-05.md) | SongRow | 1 Library | frontend | M | UI-04 |
| [UI-06](tasks/UI-06.md) | Detail panels: Key, Composer, Usage, Reminder | 1 Library | frontend | M | UI-04 |
| [UI-07](tasks/UI-07.md) | ResourcesPanel + LyricsViewer | 1 Library | frontend | M | UI-04 |

### Wave 6 — 4 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [AUTH-04](tasks/AUTH-04.md) | Session guard + requireUser | 0 Foundations | auth | S | F-05, DB-06, DB-07 |
| [AUTH-07](tasks/AUTH-07.md) | Self sign-up + account-status page | 0 Foundations | auth | M | DB-07, AUTH-01, AUTH-02 |
| [DB-05](tasks/DB-05.md) | RLS + permission parity tests | 0 Foundations | security | M | DB-03, DB-04, AUTH-05, DB-07 |
| [SRCH-08](tasks/SRCH-08.md) | ResultsList | 2 Search | frontend | S | UI-05 |

### Wave 7 — 11 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [ADM-01](tasks/ADM-01.md) | Admin: users | 1 Library | frontend | L | AUTH-04, AUTH-05, UI-02, DB-07 |
| [AUTH-03](tasks/AUTH-03.md) | SAML SSO | 0 Foundations | auth | S | AUTH-02, AUTH-07 |
| [LIB-01](tasks/LIB-01.md) | Song server actions (create/update/delete/get) | 1 Library | backend | L | DB-02, DB-06, AUTH-04, AUTH-05 |
| [LIB-02](tasks/LIB-02.md) | Song keys action | 1 Library | backend | S | DB-06, AUTH-04, AUTH-05 |
| [LIB-03](tasks/LIB-03.md) | Composers actions | 1 Library | backend | S | DB-06, AUTH-04, AUTH-05 |
| [LIB-04](tasks/LIB-04.md) | Themes actions | 1 Library | backend | S | DB-06, AUTH-04, AUTH-05 |
| [LIB-05](tasks/LIB-05.md) | Branch usage action | 1 Library | backend | S | DB-06, AUTH-04, AUTH-05 |
| [LIB-06](tasks/LIB-06.md) | File uploads + signed URLs | 1 Library | backend | M | DB-06, AUTH-04, AUTH-05 |
| [LIB-07](tasks/LIB-07.md) | External links + YouTube parsing | 1 Library | backend | S | DB-06, AUTH-04, AUTH-05 |
| [LIST-02](tasks/LIST-02.md) | List items server | 3 Lists | backend | M | DB-06, AUTH-04, AUTH-05 |
| [SRCH-10](tasks/SRCH-10.md) | Facet options | 2 Search | backend | S | DB-06, AUTH-04 |

### Wave 8 — 7 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [ADM-02](tasks/ADM-02.md) | Admin: branches | 1 Library | frontend | S | ADM-01 |
| [AUTH-06](tasks/AUTH-06.md) | Account linking + deprovisioning | 4 Sharing | auth | S | AUTH-02, ADM-01, AUTH-07 |
| [IMP-03](tasks/IMP-03.md) | Import runner CLI | 1 Library | data | M | IMP-01, IMP-02, LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07 |
| [LIB-17](tasks/LIB-17.md) | Song create/edit pages | 1 Library | frontend | L | LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-11, LIB-12, LIB-13, LIB-14, LIB-15, LIB-16, UI-02 |
| [LIB-18](tasks/LIB-18.md) | Song page | 1 Library | frontend | M | LIB-01, LIB-06, UI-06, UI-07, UI-08, UI-02 |
| [LIST-01](tasks/LIST-01.md) | Lists server (create/get/list/rename/delete) | 3 Lists | backend | M | LIB-01, LIST-03, AUTH-05 |
| [SRCH-02](tasks/SRCH-02.md) | searchSongs action + default view | 2 Search | backend | S | SRCH-01, LIB-01, AUTH-04 |

### Wave 9 — 11 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [BR-01](tasks/BR-01.md) | Branch activity server | 4 Sharing | backend | S | LIST-01, SRCH-02 |
| [BR-03](tasks/BR-03.md) | Derived branch usage job | 4 Sharing | backend | S | LIST-01, LIB-05 |
| [BR-04](tasks/BR-04.md) | Quick theme lookup | 4 Sharing | frontend | S | SRCH-02, UI-05, UI-02 |
| [CNT-03](tasks/CNT-03.md) 👤 | Pilot data entry: first 50 songs | 1 Library | content | L | LIB-17, CNT-02 |
| [H-02](tasks/H-02.md) | Theme synonyms in search | 5 Hardening | backend | S | SRCH-02, LIB-04, CNT-01 |
| [LIB-19](tasks/LIB-19.md) | Song change history | 1 Library | frontend | S | LIB-18, DB-06 |
| [LIST-07](tasks/LIST-07.md) | Setlist view + route | 3 Lists | frontend | L | LIST-01, LIST-02, UI-05, UI-02, UI-06 |
| [LIST-08](tasks/LIST-08.md) | Open Setlist / Open Playlist index | 3 Lists | frontend | S | LIST-01, UI-02 |
| [SHR-01](tasks/SHR-01.md) | Share tokens server | 4 Sharing | backend | M | LIST-01, AUTH-05 |
| [SRCH-03](tasks/SRCH-03.md) | Fuzzy title fallback + did-you-mean | 2 Search | backend | S | SRCH-02 |
| [SRCH-09](tasks/SRCH-09.md) | Library page (integration) | 2 Search | frontend | M | SRCH-02, SRCH-05, SRCH-06, SRCH-07, SRCH-08, SRCH-10, UI-06, UI-07, UI-08, UI-02, LIB-06 |

### Wave 10 — 8 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [BR-02](tasks/BR-02.md) | Branches page | 4 Sharing | frontend | S | BR-01, UI-05, UI-02 |
| [H-01](tasks/H-01.md) | PWA + offline setlists | 5 Hardening | frontend | M | LIST-07, LIB-18 |
| [H-03](tasks/H-03.md) | Semantic theme search (optional) | 5 Hardening | backend | L | H-02 |
| [LIST-09](tasks/LIST-09.md) | Wire list creation + Add-to-List into app | 3 Lists | frontend | M | LIST-04, LIST-05, LIST-06, LIST-01, LIST-02, SRCH-09, UI-02 |
| [PLAY-05](tasks/PLAY-05.md) | PlaylistView | 3 Lists | frontend | M | PLAY-02, PLAY-03, PLAY-04, PLAY-06, LIST-07 |
| [SHR-02](tasks/SHR-02.md) | Public share page | 4 Sharing | frontend | S | SHR-01, UI-05 |
| [SHR-03](tasks/SHR-03.md) | Share by email | 4 Sharing | backend | S | SHR-01, F-05 |
| [SRCH-11](tasks/SRCH-11.md) | Search performance test | 2 Search | backend | S | SRCH-03 |

### Wave 11 — 3 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [ADM-04](tasks/ADM-04.md) | Access request emails | 4 Sharing | backend | S | SHR-03, AUTH-07, ADM-01 |
| [H-04](tasks/H-04.md) | Accessibility audit + fixes | 5 Hardening | qa | M | SRCH-09, LIST-09, PLAY-05, LIB-17 |
| [SHR-04](tasks/SHR-04.md) | ShareDialog + nav Share wiring | 4 Sharing | frontend | S | SHR-01, SHR-03, LIST-09, LIST-07, PLAY-05 |

### Wave 12 — 2 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [DOC-01](tasks/DOC-01.md) | User guide | 5 Hardening | content | S | SRCH-09, LIST-09, SHR-04 |
| [H-05](tasks/H-05.md) | End-to-end journey suite | 5 Hardening | qa | M | SRCH-09, LIST-09, SHR-04, PLAY-05, LIB-17 |

### Wave 13 — 1 tasks in parallel

| ID | Title | Phase | Stream | Size | Depends on |
|---|---|---|---|---|---|
| [PILOT-01](tasks/PILOT-01.md) 👤 | Pilot branch rollout | 5 Hardening | content | L | H-05, DOC-01, OPS-03, CNT-03 |

👤 = human required (agents skip).

## By stream

| Stream | Tasks |
|---|---|
| auth | AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-06, AUTH-07 |
| backend | ADM-04, BR-01, BR-03, H-02, H-03, LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-16, LIST-01, LIST-02, LIST-03, SHR-01, SHR-03, SRCH-01, SRCH-02, SRCH-03, SRCH-10, SRCH-11 |
| content | CNT-01, CNT-02, CNT-03, DOC-01, PILOT-01 |
| data | DB-01, DB-02, DB-04, DB-07, IMP-01, IMP-02, IMP-03 |
| frontend | ADM-01, ADM-02, BR-02, BR-04, H-01, LIB-10, LIB-11, LIB-12, LIB-13, LIB-14, LIB-15, LIB-17, LIB-18, LIB-19, LIST-04, LIST-05, LIST-06, LIST-07, LIST-08, LIST-09, PLAY-01, PLAY-02, PLAY-03, PLAY-04, PLAY-05, PLAY-06, SHR-02, SHR-04, SRCH-04, SRCH-05, SRCH-06, SRCH-07, SRCH-08, SRCH-09, UI-01, UI-02, UI-04, UI-05, UI-06, UI-07, UI-08 |
| ops | OPS-01, OPS-02, OPS-03 |
| platform | DB-06, F-01, F-02, F-03, F-04, F-05 |
| qa | H-04, H-05 |
| security | AUTH-05, DB-03, DB-05 |

## Requirement coverage

| Requirement | Tasks |
|---|---|
| REQ-AUTH-01 | AUTH-02, AUTH-03 |
| REQ-AUTH-02 | AUTH-01 |
| REQ-AUTH-03 | AUTH-02, DB-07, AUTH-07, ADM-01, AUTH-03, AUTH-06 |
| REQ-AUTH-04 | AUTH-02, AUTH-07 |
| REQ-AUTH-05 | AUTH-06 |
| REQ-AUTH-06 | AUTH-04, AUTH-06 |
| REQ-AUTH-07 | AUTH-05, DB-03, ADM-01 |
| REQ-AUTH-08 | DB-07, AUTH-04, AUTH-07, ADM-01, ADM-04 |
| REQ-BR-01 | BR-01, BR-02 |
| REQ-BR-02 | BR-03 |
| REQ-BR-03 | BR-04 |
| REQ-LIB-01 | LIB-01, LIB-17 |
| REQ-LIB-02 | F-03, DB-01, LIB-10, LIB-01, LIB-03 |
| REQ-LIB-03 | DB-01, LIB-10, UI-04, LIB-03 |
| REQ-LIB-04 | LIB-01 |
| REQ-LIB-05 | DB-01, LIB-15, LIB-05 |
| REQ-LIB-06 | F-03, DB-01, LIB-12, LIB-01 |
| REQ-LIB-07 | LIB-13, LIB-04, H-02 |
| REQ-LIB-08 | F-03, DB-01, LIB-11, LIB-02 |
| REQ-LIB-09 | DB-01, LIB-14, LIB-06, LIB-07 |
| REQ-LIB-10 | DB-01, LIB-14, LIB-06 |
| REQ-LIB-11 | LIB-06 |
| REQ-LIB-12 | DB-06, LIB-01, LIB-19 |
| REQ-LIB-13 | IMP-01, IMP-02, IMP-03 |
| REQ-LIB-14 | LIB-16, LIB-12 |
| REQ-LIST-01 | LIST-04, LIST-05, LIST-01, LIST-09 |
| REQ-LIST-02 | LIST-06, LIST-02, LIST-09, H-05 |
| REQ-LIST-03 | LIST-02, LIST-01, LIST-07 |
| REQ-LIST-04 | DB-01, LIST-03, LIST-02, LIST-07 |
| REQ-LIST-05 | PLAY-01, PLAY-04, PLAY-06, LIST-02, PLAY-05 |
| REQ-LIST-06 | LIST-01, LIST-07 |
| REQ-LIST-07 | LIST-01, LIST-08 |
| REQ-LIST-08 | DB-03, LIST-01 |
| REQ-NAV-01 | UI-02, LIST-09, H-05 |
| REQ-NAV-02 | AUTH-01, SRCH-09 |
| REQ-NAV-03 | SRCH-04, UI-02 |
| REQ-NAV-04 | LIST-04, UI-02, SHR-04 |
| REQ-NF-01 | UI-01, H-01 |
| REQ-NF-02 | H-01 |
| REQ-NF-03 | UI-01, UI-04, H-04 |
| REQ-NF-04 | OPS-03, OPS-02 |
| REQ-NF-05 | DB-03 |
| REQ-ROW-01 | UI-04, UI-05 |
| REQ-ROW-02 | UI-05, UI-06, UI-07, SRCH-09 |
| REQ-ROW-03 | UI-07, LIB-18 |
| REQ-ROW-04 | UI-08, LIB-18 |
| REQ-SHARE-01 | SHR-01, SHR-02, SHR-04, H-05 |
| REQ-SHARE-02 | SHR-03, SHR-04 |
| REQ-SHARE-03 | SHR-01, SHR-02 |
| REQ-SRCH-01 | SRCH-01, SRCH-02, SRCH-09 |
| REQ-SRCH-02 | DB-02, SRCH-05, SRCH-01 |
| REQ-SRCH-03 | SRCH-01, SRCH-06, SRCH-10 |
| REQ-SRCH-04 | SRCH-07, SRCH-01 |
| REQ-SRCH-05 | F-03, SRCH-04 |
| REQ-SRCH-06 | DB-02, SRCH-03 |
| REQ-SRCH-07 | SRCH-11 |
