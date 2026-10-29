# CR LIST-04 · `readCurrentListId()` needs a server-only home

**Status:** proposed.

## Problem

`tasks/LIST-04.md` asks for a server helper `readCurrentListId()`, but the task owns only
`features/lists/ui/CurrentList.tsx`, which must be a `'use client'` module (it holds the React
context). Anything exported from a client module is a client reference when imported by a
server component, so a server helper there cannot be called on the server (and it would need
`next/headers`, which is server-only). The helper has no valid owned path.

LIST-04 ships the provider + hook only. The cookie it writes is:

- name `current_list`, value = list id (URI-encoded UUID), `Path=/`, `Max-Age=43200` (12 h,
  absolute from when the list was chosen; not refreshed on page views), `SameSite=Lax`,
  `Secure` on https. Cleared with `Max-Age=0` when the current list is set to `null`.

## Proposed diff

`tasks/LIST-04.md` owns (or a follow-up task, e.g. LIST-09, owns):

```diff
-owns: ["features/lists/ui/CurrentList.tsx"]
+owns: ["features/lists/ui/CurrentList.tsx", "features/lists/server/currentList.ts"]
```

`contracts/ui.md` (or the server contract), add:

```ts
// features/lists/server/currentList.ts
import 'server-only';
export const CURRENT_LIST_COOKIE = 'current_list';
/** Returns the cookie's list id if it is a valid UUID, else null. */
export async function readCurrentListId(): Promise<UUID | null>; // via `await cookies()` from next/headers
```

The layout (UI-02 / LIST-09) then loads that list with the caller's permissions and passes
`initial={list ?? null}` to `<CurrentListProvider>`. Passing `null` for a deleted or
inaccessible list makes the provider clear the stale cookie ("cleared if list is deleted").
The delete-list action may also clear the cookie server-side and `revalidatePath('/', 'layout')`.

## Affects

- **LIST-04**: helper not delivered until approved.
- **LIST-09 / UI-02**: call `readCurrentListId()` in `app/(app)/layout.tsx` and pass `initial`.
- **LIST-01** (list delete): optionally clear the cookie when deleting the current list.
