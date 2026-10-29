# People of Praise Music App — Specification

> Agent-readable version of `Music_App_Technical_Proposal.docx`. If the two disagree, **this file wins** for implementation.
> Requirement IDs (`REQ-…`) are referenced by task files in `tasks/`. Do not renumber them; append new ones.

## 1. Product summary

A members-only web app (installable PWA) that is the shared, searchable library of every song People of Praise branches use, with sheet music, audio examples and projection files. On top of the library sit two list types:

- **Event setlist** — songs for a dated event (Lord's Day, prayer meeting). Per-song key/BPM/energy overrides.
- **Listening playlist** — songs with a chosen audio item each, playable in-app.

Primary users:

| Persona | Needs |
|---|---|
| Branch member | Find songs, view lyrics/charts, build listening playlists |
| Music leader | Build setlists, share with ministry team, see what other branches use |
| Meeting leader | Type a theme from a prophetic word, get a dozen matching songs fast |
| Contributor (select team) | Add songs, upload files, tag songs |
| Admin | Users, branches, roles, bulk import |

Branches (initial): **Servant (SV)**, **Portland (OR)**, **CO Springs (CO)**, **Rockford (RF)**. More may be added. The two-letter code is what the song row shows in the "added by" slot.

## 2. Requirements

### 2.1 Authentication & access (REQ-AUTH)

- **REQ-AUTH-01** Users sign in with SSO: OIDC (Google, Microsoft) and SAML 2.0 for the organization's identity provider.
- **REQ-AUTH-02** Email + password login (with password reset) remains available as a fallback for members without an SSO account.
- **REQ-AUTH-03** Anyone can request an account: sign up with email + password, or sign in with SSO for the first time. New accounts start **pending** and can see no data until an admin approves them. Accounts an admin invites are approved when created. *(Changed 2026-10-29 by the project owner; previously "no public signup".)*
- **REQ-AUTH-04** On first SSO login, branch and role are derived from IdP group → `branches.sso_group`; default role `member`. These are suggestions the approving admin can change (REQ-AUTH-08); the account is still pending.
- **REQ-AUTH-05** An SSO identity links to an existing account with the same verified email.
- **REQ-AUTH-06** Disabled users (`users.disabled_at` set) cannot sign in or use existing sessions.
- **REQ-AUTH-07** Roles: `member`, `contributor`, `music_leader`, `admin`. Permissions per `contracts/permissions.md`, enforced in Postgres RLS **and** server code.
- **REQ-AUTH-08** Admins review access requests: they see pending accounts and approve each one (choosing role and branch; for SSO users the IdP group mapping pre-fills the branch) or reject it. Pending and rejected users who sign in see only an account-status page. Admins are emailed about new requests, and users are emailed when approved.

### 2.2 Library — building entries (REQ-LIB) — Diagram I

- **REQ-LIB-01** Contributors+ create song entries and can later edit tags and files.
- **REQ-LIB-02** Basic info: title, alternate titles (0..n), composers (1..n, ordered), source group, year composed.
- **REQ-LIB-03** Composers carry a POP-membership flag: `none | past | current`. Past/current are color-highlighted in the UI.
- **REQ-LIB-04** Who added: the adding branch is recorded automatically from the creator's branch (editable by admin).
- **REQ-LIB-05** Branch usage per branch: `high | low | rare | none`.
- **REQ-LIB-06** Full lyrics stored per section: chorus, verse 1–5, bridge (7 sections), plus an **arrangement** (ordered list of sections as sung, repeats allowed).
- **REQ-LIB-07** Lyric themes are tagged per section from a shared, normalized theme vocabulary; new themes can be created inline.
- **REQ-LIB-08** Musical tags: one primary key + 0..n alternate keys; each key has first chords for intro, verse, chorus, bridge; tempo (BPM), time signature, energy level (5 levels, see §4), free-text energy notes (e.g. "starts light, slow build, big bridge build").
- **REQ-LIB-09** Files attach to a specific key: full score PDF, lead sheet PDF, chord chart PDF (several allowed), MP3. Links attach to a key: YouTube, other audio/video, instruction links.
- **REQ-LIB-10** Projection files (`.pro`, `.mdb`, `.ppt`, `.pptx`) attach to the song, independent of key. A projection resource may instead be a link (e.g. a shared-drive or slide-deck URL), also key-independent.
- **REQ-LIB-11** All files are private; served only to signed-in users via short-lived signed URLs.
- **REQ-LIB-12** Edits are recorded in an audit log (who, when, what changed) viewable on the song.
- **REQ-LIB-13** Bulk import from CSV + a folder of files, with dry-run report and idempotent re-run.
- **REQ-LIB-14** Paste-and-split helper: paste full lyrics with section headings and have them split into the 7 section fields + arrangement.

### 2.3 Navigation (REQ-NAV) — Diagram II

- **REQ-NAV-01** Omnipresent navigation: Search Library, Create Event Setlist, Create Listening Playlist, Open Setlist, Open Playlist, Home, Share.
- **REQ-NAV-02** After login, land on the Worship Library default view.
- **REQ-NAV-03** Home shows the default list (newest added first, then alphabetical) and **clears** search parameters.
- **REQ-NAV-04** Share acts on the *current list*; disabled when there is none.

### 2.4 Search (REQ-SRCH) — Diagram II

- **REQ-SRCH-01** Default view: all songs ordered by `created_at desc, title asc`.
- **REQ-SRCH-02** Optional free text, searchable across fields individually toggleable: Titles (incl. alternate), Lyrics (all sections), Themes, Composer.
- **REQ-SRCH-03** Optional concurrent multi-select filters: energy level(s), key(s), decade(s) written, branch use (branch + level), first chord of chorus/refrain, first chord of verse, first chord of bridge.
- **REQ-SRCH-04** Sort: alphanumeric, primary key, energy level, date added, branch use.
- **REQ-SRCH-05** "New search" keeps current parameters; parameters live in the URL so back/forward and shared URLs work.
- **REQ-SRCH-06** Typo-tolerant title matching (trigram) when full-text finds few results.
- **REQ-SRCH-07** p95 search latency < 300 ms server-side at 5,000 songs.

### 2.5 Song row & detail (REQ-ROW) — Diagram III

- **REQ-ROW-01** Each result/setlist row shows, left→right: BPM on energy-colored chip, time signature, usual key, most common title, composer (POP-highlighted), year, Resources, added-by branch code, ADD.
- **REQ-ROW-02** Each region is a tap target: key → all keys with first chords; title → chorus first line + verse 1 first line; composer → all composers; Resources → lyrics, sheet music, audio, projection files; branch code → branch usage; ADD → add-to-list menu.
- **REQ-ROW-03** Lyrics open in a readable viewer showing sections in arrangement order.
- **REQ-ROW-04** PDFs open in an in-app viewer; audio plays inline; projection files download; projection links open in a new tab.

### 2.6 Lists (REQ-LIST) — Diagram II/III

- **REQ-LIST-01** Create setlist or playlist: enter event date + name. It becomes the session's *current list*.
- **REQ-LIST-02** Add to list from any song row: Current (if one is set) / Existing (dropdown) / New (date + name). After adding, return to search results with params intact.
- **REQ-LIST-03** Setlist: edit, reorder (drag and drop), rename, delete, share.
- **REQ-LIST-04** Setlist per-song overrides: key, BPM, energy — independent of library files. If no `song_keys` row exists for the override key, first chords display **"X"** and resources are empty, with a prompt to upload files for that key.
- **REQ-LIST-05** Playlist: per-song chosen audio item (MP3 or YouTube link); play, pause, stop, skip ahead/back, auto-advance; edit order; rename; delete; share.
- **REQ-LIST-06** Lists persist until manually deleted (soft delete).
- **REQ-LIST-07** Open Setlist / Open Playlist show the user's lists and their branch's lists; upcoming events first.
- **REQ-LIST-08** Setlists are readable by all members (supports "what other branches are using"); playlists are private to their owner unless shared.

### 2.7 Sharing & cross-branch (REQ-SHARE, REQ-BR)

- **REQ-SHARE-01** Share a list via tokenized read-only link including modified tags (overrides); optional expiry; revocable.
- **REQ-SHARE-02** Share a list by email (summary + link).
- **REQ-SHARE-03** The public share page shows list content and overrides; opening files still requires sign-in.
- **REQ-BR-01** "Other branches" view: recently added songs per branch, upcoming setlists per branch, most-used songs per branch (last 90 days).
- **REQ-BR-02** Branch usage can be derived nightly from setlist history (thresholds in `contracts/api.md`); manual values take precedence.
- **REQ-BR-03** Quick theme lookup: a single large input that returns theme matches, readable on a phone held up to another person.

### 2.8 Non-functional (REQ-NF)

- **REQ-NF-01** Responsive: phone (≥360px) through desktop. Installable PWA.
- **REQ-NF-02** Offline: setlists the user has opened, and their PDFs, remain viewable offline.
- **REQ-NF-03** Accessibility: WCAG 2.1 AA. Energy is never conveyed by color alone (label/tooltip text too).
- **REQ-NF-04** Errors tracked (Sentry); daily DB backups; storage usage alerts.
- **REQ-NF-05** Every server mutation is authorized server-side; RLS is defense in depth.

## 3. Tech stack (decided)

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) everywhere |
| Framework | Next.js 15 App Router, React Server Components, Server Actions |
| Styling | Tailwind CSS v4, shadcn/ui (Radix) |
| DB | PostgreSQL 15+ via Supabase; extensions `pg_trgm`, `unaccent` (later `vector`) |
| ORM | Drizzle ORM + drizzle-kit migrations |
| Auth | Supabase Auth — OIDC (Google, Azure/Entra), SAML 2.0 SSO, email/password |
| Storage | Supabase Storage, private bucket `resources` |
| Validation | Zod |
| Client state | URL search params for search; React context for current list; no global store library |
| Drag & drop | dnd-kit |
| PDF | react-pdf (pdf.js) |
| Audio | HTML5 Audio + YouTube IFrame Player API |
| Email | Resend + react-email |
| PWA | Serwist |
| Tests | Vitest (unit/integration), Playwright (e2e), @axe-core/playwright |
| Monitoring | Sentry |
| Hosting/CI | Vercel; GitHub Actions; local dev via Supabase CLI (`supabase start`) |
| Package manager | pnpm |

## 4. Domain constants

Energy levels (order matters for sorting, highest first):

| value | label | color | hex |
|---|---|---|---|
| `high_praise` | High Energy 'Praise' | red | `#D7263D` |
| `high_worship` | High Energy 'Worship' | yellow | `#F2B705` |
| `mid_worship` | Mid Energy 'Worship' | green | `#4CAF50` |
| `deep_worship` | Deep 'Worship' | purple | `#7B4FA0` |
| `quiet_worship` | Quiet 'Worship' | blue | `#3A8FD6` |

Lyric sections: `chorus`, `verse_1` … `verse_5`, `bridge`. Full definitions in `contracts/types.md`.

## 5. Phases

| Phase | Goal | Exit criteria |
|---|---|---|
| 0 Foundations | Repo, contracts in code, DB, auth/SSO, shell | Members sign in with SSO and land in the app shell |
| 1 Library | Diagram I end to end + import | 50 real songs entered |
| 2 Search | Diagram II search + Diagram III row/panels | Find a song by theme and open its chord chart |
| 3 Lists | Setlists, playlists, player | A leader builds and runs a real Lord's Day setlist |
| 4 Sharing | Links, email, branch feed, derived usage, quick lookup | Setlist shared to a team and opened on phones |
| 5 Hardening | PWA/offline, synonyms, a11y, e2e, pilot | One branch uses it for a month |

Phases describe *release* order. Tasks inside them run concurrently wherever dependencies allow — see `tasks/INDEX.md`.

## 6. Open questions

Each has a **default** that agents must use until a human resolves it. Do not block on these.

- **Copyright / CCLI licensing** for storing lyrics, sheet music and MP3s. *Default:* build everything behind login with signed URLs; share pages never expose files.
- **SSO identity provider(s).** *Default:* implement Google + Microsoft OIDC and generic SAML; providers enabled by env/config.
- **Do SSO users whose group maps to a branch skip approval?** *Decided (project owner, 2026-10-29):* no. Every new account, SSO included, starts pending (REQ-AUTH-03).
- **Must a self-registered email be confirmed before the request reaches admins?** *Default:* yes when the Supabase project has email confirmation on (hosted); local dev runs with it off. The account is pending either way.
- **SAML on Supabase plan tier** (may require paid plan). *Default:* SAML code path ships behind `FEATURE_SAML=false`.
- **Email/password for non-SSO members.** *Default:* enabled.
- **Branch usage: manual vs derived.** *Default:* manual first; derived job in Phase 4; manual overrides derived.
- **Projection files (.pro/.mdb):** store only or preview? *Default:* store + download only.
- **Existing song collection location/format.** *Default:* CSV template in `contracts/api.md` §Import plus a folder of files named by convention.
- **Lyric edge cases** (pre-chorus, tag, second bridge). *Default:* fold into nearest section; no extra columns.
- **Theme vocabulary owner.** *Default:* `music_leader` and `admin` can merge themes; contributors can create.
- **Playlist visibility to branch.** *Default:* private to owner (REQ-LIST-08).
