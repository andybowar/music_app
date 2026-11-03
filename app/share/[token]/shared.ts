/**
 * What the public share page may show (SHR-02; REQ-SHARE-01, REQ-SHARE-03).
 *
 * `getSharedList` already drops every resource `url` and `storagePath`. This module narrows the
 * `ListDetail` further before anything is serialized to the client: the owner (id and name),
 * the branch id, timestamps and per-item notes are not part of the share page (header: name,
 * date, branch; rows: songs with their overrides), so they are left out of the props.
 */

import type { ListDetail, ListType, ResolvedItem, Resource, UUID } from '@/types/domain';

export interface SharedList {
  id: UUID;
  type: ListType;
  name: string;
  eventDate: string | null;
  branchCode: string | null;
  items: ResolvedItem[];
}

/**
 * A resource that can be listed but not opened: no link and no storage path. Built from an
 * allowlist, so a field added to the row later (an uploader, say) isn't passed on by accident.
 */
function lockedResource(r: Resource): Resource {
  return {
    id: r.id,
    songId: r.songId,
    songKeyId: r.songKeyId,
    kind: r.kind,
    format: r.format,
    label: r.label,
    url: null,
    storagePath: null,
    sizeBytes: r.sizeBytes,
    mimeType: r.mimeType,
    createdAt: r.createdAt,
  };
}

function sharedItem(r: ResolvedItem): ResolvedItem {
  return {
    ...r,
    item: { ...r.item, notes: null },
    resources: r.resources.map(lockedResource),
  };
}

/** The public projection of a shared list. */
export function toSharedList(list: ListDetail): SharedList {
  return {
    id: list.id,
    type: list.type,
    name: list.name,
    eventDate: list.eventDate,
    branchCode: list.branchCode,
    items: list.items.map(sharedItem),
  };
}

/**
 * Where "Sign in to open files" goes. Setlists are readable by every member (REQ-LIST-08), so
 * after sign-in the recipient lands on the same setlist with its files. Playlists are private
 * to their owner, so for them sign-in lands on the default page rather than a "not found".
 */
export function signInHref(list: Pick<SharedList, 'id' | 'type'>): string {
  if (list.type !== 'setlist') return '/login';
  const next = `/lists/${encodeURIComponent(list.id)}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

/** A plain event date ('YYYY-MM-DD', no time zone) in the reader's locale. */
export function formatEventDate(date: string, locale?: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(parsed);
}

export function songCountLabel(n: number): string {
  return n === 1 ? '1 song' : `${n} songs`;
}
