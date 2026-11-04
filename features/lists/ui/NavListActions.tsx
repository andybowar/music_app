'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { NavBar } from '@/components/NavBar';
import { ShareDialog } from '@/features/sharing/ui/ShareDialog';
import type { ActionResult, List, ListType } from '@/types/domain';
import type { ListInput } from '@/types/validation';

import { useListActions } from './AddToListAction';
import { CreateListDialog } from './CreateListDialog';
import { useCurrentList } from './CurrentList';

export interface NavListActionsProps {
  /**
   * Optional: notified when Share is pressed. Share itself opens `ShareDialog` for the current
   * list here (SHR-04), so callers need not pass this; `app/(app)/layout.tsx`'s no-op
   * placeholder can go (agent-spec/change-requests/SHR-04-layout-share-placeholder.md).
   */
  onShare?(): void;
  /** Passed to `NavBar`: show "Add song" in the More menu (LIB-20). */
  canAddSong?: boolean;
}

/** Where a newly created list sends the user: the library, to start adding songs. */
export const AFTER_CREATE_HREF = '/library';

const UNAVAILABLE: ActionResult<List> = {
  ok: false,
  error: { code: 'INTERNAL', message: 'Lists are unavailable right now. Please reload the page.' },
};

/**
 * `NavBar` wired to the session's lists (LIST-09; REQ-NAV-01, REQ-LIST-01): "Create event
 * setlist" / "Create listening playlist" open `CreateListDialog`; on success the new list is the
 * current list and the user lands on the Worship Library. "Share" opens `ShareDialog` for the
 * current list (SHR-04, REQ-NAV-04; the NavBar disables it when there is none). Must sit inside
 * `CurrentListProvider` and `ListActionsProvider`.
 */
export function NavListActions({ onShare, canAddSong = false }: NavListActionsProps) {
  const router = useRouter();
  const { current } = useCurrentList();
  const actions = useListActions();
  const [dialogType, setDialogType] = useState<ListType | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const submit = async (input: ListInput): Promise<ActionResult<List>> => {
    if (!actions) return UNAVAILABLE;
    const result = await actions.create(input);
    if (result.ok) router.push(AFTER_CREATE_HREF);
    return result;
  };

  return (
    <>
      <NavBar
        currentList={current}
        onCreate={setDialogType}
        onShare={() => {
          setShareOpen(true);
          onShare?.();
        }}
        canAddSong={canAddSong}
      />
      {(['setlist', 'playlist'] as const).map((type) => (
        <CreateListDialog
          key={type}
          type={type}
          open={dialogType === type}
          onOpenChange={(open) => setDialogType(open ? type : null)}
          onSubmit={submit}
        />
      ))}
      {current && <ShareDialog list={current} open={shareOpen} onOpenChange={setShareOpen} />}
    </>
  );
}
