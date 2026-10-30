# Contract: UI — routes, components, tokens

**Status: FROZEN** for names, paths and props. Visual details inside a component are the implementing agent's call, within the tokens below.

## Routes

| Route | Purpose | Owner task |
|---|---|---|
| `/login` | Password + SSO buttons (+ SAML "use your organization" by email domain) | AUTH-01 (SSO buttons: AUTH-02, SAML: AUTH-03 — via slots) |
| `/reset`, `/reset/confirm` | Password reset | AUTH-01 |
| `/signup` | Request an account (name, email, password); SSO buttons also create a request | AUTH-07 |
| `/account-status` | Shown to signed-in pending/rejected users: "awaiting approval" or "request declined", plus sign out. No app data | AUTH-07 |
| `/auth/callback` | OIDC/SAML callback → provision → redirect `/library` | AUTH-02 |
| `/library` | Worship Library: default view + search + results (Home target) | SRCH-09 |
| `/songs/new`, `/songs/[id]/edit` | Song form | LIB-17 |
| `/songs/[id]` | Song page (all detail, lyrics, files, history tab) | LIB-18 |
| `/lists?type=setlist\|playlist` | Open Setlist / Open Playlist | LIST-08 |
| `/lists/[id]` | Setlist view or Playlist view (dispatch on type) | LIST-07 (PlaylistView: PLAY-05) |
| `/branches` | Other branches activity | BR-02 |
| `/quick` | Quick theme lookup | BR-04 |
| `/share/[token]` | Public read-only list | SHR-02 |
| `/admin/users`, `/admin/branches` | Admin | ADM-01, ADM-02 |
| `/dev/[component]` | Component gallery with fixtures; 404 on the production deployment via `if (!isDevGalleryEnabled()) notFound()` (`lib/devGallery.ts`), served on previews | each UI task adds its own page |

Route groups: `app/(auth)/…` (no shell), `app/(app)/…` (shell + `requireUser`), `app/share/…` (public), `app/dev/…`.

## Interaction patterns

- Detail panels: `Popover` on ≥768px, bottom `Sheet` below 768px. One shared wrapper `components/ResponsivePanel.tsx` (UI-01).
- Toasts for success/failure of every mutation (`components/ui/sonner`).
- Mutations: optimistic where cheap (reorder, add-to-list), with rollback on `ok:false`.
- Empty, loading (skeleton) and error states required for every data view.

## Tokens (UI-01)

- Energy colors from `ENERGY_META` exposed as Tailwind theme colors `energy-high_praise` … `energy-quiet_worship`.
- POP composer highlight: `current` → green text `#4CAF50`, `past` → muted green `#8BBF8D`, both with `title` tooltip "People of Praise member (current|past)".
- Row background `#2B2B2B`, row text white; chip radius 4px; base font Inter (or system), row title 16px semibold.
- Minimum tap target 40×40px.

## Song row layout (REQ-ROW-01)

```
┌──────┬───┬────┬──────────────────────────────────────┬───────────┬────┬─────┐
│ 68   │ 4 │ D  │ 1000 Hallelujas · Ligertwood 2021     │ Resources │ OR │ ADD │
│(chip)│ 4 │    │ title            composer(POP)  year  │           │    │     │
└──────┴───┴────┴──────────────────────────────────────┴───────────┴────┴─────┘
 energy  ts  key   onTitle                               onResources onUsage onAdd
```
On <480px: hide time signature; composer/year wrap under title.

## Components

All components are client components unless noted, props-only (no data fetching inside), and exported as named exports.

| Component | Path | Props | Task |
|---|---|---|---|
| `ResponsivePanel` | `components/ResponsivePanel.tsx` | `{ trigger: ReactNode; title: string; children: ReactNode }` | UI-01 |
| `NavBar` | `components/NavBar.tsx` | `{ currentList: List \| null; onCreate(type: ListType): void; onShare(): void }` | UI-02 |
| `EnergyChip` | `components/song/EnergyChip.tsx` | `{ energy: EnergyLevel \| null; bpm: number \| null; overridden?: boolean }` | UI-04 |
| `KeyBadge` | `components/song/KeyBadge.tsx` | `{ value: string \| null; overridden?: boolean }` | UI-04 |
| `TimeSigBadge` | `components/song/TimeSigBadge.tsx` | `{ value: string \| null }` | UI-04 |
| `ComposerName` | `components/song/ComposerName.tsx` | `{ composers: Array<{ name; popMember }>; max?: number }` | UI-04 |
| `BranchCode` | `components/song/BranchCode.tsx` | `{ code: string \| null }` | UI-04 |
| `SongRow` | `components/song/SongRow.tsx` | `{ song: SongSummary; resolved?: ResolvedItem; onKey(); onTitle(); onComposer(); onResources(); onUsage(); addSlot?: ReactNode; dragHandle?: ReactNode }` | UI-05 |
| `KeyPanel` | `components/song/panels/KeyPanel.tsx` | `{ keys: SongKey[]; highlightKey?: string }` | UI-06 |
| `ComposerPanel` | `components/song/panels/ComposerPanel.tsx` | `{ composers: Composer[] }` | UI-06 |
| `UsagePanel` | `components/song/panels/UsagePanel.tsx` | `{ addedByBranchCode: string \| null; usage: BranchUsage[] }` | UI-06 |
| `ReminderPanel` | `components/song/panels/ReminderPanel.tsx` | `{ chorusLine: string \| null; verse1Line: string \| null }` | UI-06 |
| `ResourcesPanel` | `components/song/panels/ResourcesPanel.tsx` | `{ resources: Resource[]; keys: SongKey[]; onOpen(r: Resource): void; onShowLyrics(): void }` groups: Lyrics, Sheet Music (by key), Audio (by key), Projection | UI-07 |
| `LyricsViewer` | `components/song/LyricsViewer.tsx` | `{ lyrics: SongLyrics; arrangement: Section[]; mode?: 'arrangement' \| 'sections' }` | UI-07 |
| `PdfViewer` | `components/media/PdfViewer.tsx` | `{ url: string; title: string; onClose(): void }` | UI-08 |
| `InlineAudio` | `components/media/InlineAudio.tsx` | `{ url: string; title: string }` | UI-08 |
| `SearchBar` | `features/search/ui/SearchBar.tsx` | `{ value: string; fields: SearchField[]; onChange(q, fields): void; onSubmit(): void }` | SRCH-05 |
| `FilterBar` | `features/search/ui/FilterBar.tsx` | `{ params: SearchParams; facets: FacetOptions; onChange(p: SearchParams): void }` | SRCH-06 |
| `SortControl` | `features/search/ui/SortControl.tsx` | `{ sort?: Sort; dir?: 'asc'\|'desc'; onChange(sort, dir): void }` | SRCH-07 |
| `ResultsList` | `features/search/ui/ResultsList.tsx` | `{ result: SearchResult; renderRow(s: SongSummary): ReactNode; onLoadMore(): void; loading: boolean }` | SRCH-08 |
| `useSearchState` | `features/search/ui/useSearchState.ts` | hook → `{ params, setParams(p), newSearch(), clear() }` backed by URL | SRCH-04 |
| `CurrentListProvider` / `useCurrentList` | `features/lists/ui/CurrentList.tsx` | `{ initial: List \| null }` → `{ current, setCurrent(l) }`; persisted in cookie `current_list` | LIST-04 |
| `CreateListDialog` | `features/lists/ui/CreateListDialog.tsx` | `{ type: ListType; open; onOpenChange; onSubmit(input): Promise<ActionResult<List>> }` | LIST-05 |
| `AddToListMenu` | `features/lists/ui/AddToListMenu.tsx` | `{ songId; current: List \| null; lists: List[]; onAdd(listId): Promise<ActionResult<unknown>>; onCreate(input): Promise<ActionResult<List>>; onUndo?(listId, added: unknown): Promise<ActionResult<unknown>>; songTitle?: string }` | LIST-06 |
| `ItemOverrideEditor` | `features/lists/ui/ItemOverrideEditor.tsx` | `{ resolved: ResolvedItem; keys: SongKey[]; onChange(patch): void }` | LIST-07 |
| `SetlistView` | `features/lists/ui/SetlistView.tsx` | `{ list: ListDetail; canEdit: boolean }` | LIST-07 |
| `PlayerBar` | `features/player/ui/PlayerBar.tsx` | `{ state: PlayerState; dispatch(e: PlayerEvent): void }` | PLAY-04 |
| `AudioPicker` | `features/player/ui/AudioPicker.tsx` | `{ resources: Resource[]; value: UUID \| null; onChange(id): void }` | PLAY-06 |
| `PlaylistView` | `features/player/ui/PlaylistView.tsx` | `{ list: ListDetail; canEdit: boolean }` | PLAY-05 |
| `ShareDialog` | `features/sharing/ui/ShareDialog.tsx` | `{ list: List; open; onOpenChange }` | SHR-04 |
| Song form sections | `features/songs/ui/form/*.tsx` | each `{ value: Partial<SongFormValue>; onChange(v): void; errors?: Record<string,string[]> }` | LIB-10…15 |

`SongFormValue` (defined in `features/songs/ui/form/types.ts` by LIB-10):
```ts
export interface SongFormValue {
  basic: { title: string; altTitles: string[]; composers: Composer[]; sourceGroup: string|null; year: number|null };
  musical: { keys: Array<Omit<SongKey,'id'|'songId'> & { id?: UUID }>; tempoBpm: number|null; timeSignature: string|null; energyLevel: EnergyLevel|null; energyNotes: string|null };
  lyrics: { lyrics: Partial<SongLyrics>; arrangement: Section[] };
  themes: Array<{ section: Section; theme: Theme }>;
  usage: Array<{ branchId: UUID; level: UsageLevel }>;
}
```
