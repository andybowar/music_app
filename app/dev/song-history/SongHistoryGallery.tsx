'use client';

import { useMemo, useState } from 'react';

import { AUDIT_FIXTURE_SONG_ID, songAuditTrail } from '@/features/audit/fixtures';
import { SongHistory, type LoadAuditTrail } from '@/features/audit/ui/SongHistory';

const STATES = ['trail', 'empty', 'loading', 'error', 'forbidden'] as const;
type GalleryState = (typeof STATES)[number];

const STATE_LABEL: Record<GalleryState, string> = {
  trail: 'Trail',
  empty: 'Empty',
  loading: 'Loading',
  error: 'Error',
  forbidden: 'Forbidden (member)',
};

function fakeLoader(state: GalleryState): LoadAuditTrail {
  return async () => {
    if (state === 'loading') return new Promise(() => {});
    await new Promise((r) => setTimeout(r, 400));
    switch (state) {
      case 'trail':
        return { ok: true, data: songAuditTrail };
      case 'empty':
        return { ok: true, data: [] };
      case 'forbidden':
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: "You don't have permission to do that." },
        };
      default:
        return { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong.' } };
    }
  };
}

/** Body of `/dev/song-history`: the song page's History tab (LIB-19) with fixture entries. */
export function SongHistoryGallery() {
  const [state, setState] = useState<GalleryState>('trail');
  const load = useMemo(() => fakeLoader(state), [state]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
      <header className="flex flex-col gap-3">
        <h1 className="text-sm font-medium text-muted-foreground">
          LIB-19 · Song history with fixture entries
        </h1>
        <label className="flex w-fit flex-col gap-1 text-sm">
          State
          <select
            className="min-h-tap rounded-md border bg-background px-2"
            value={state}
            onChange={(e) => setState(e.target.value as GalleryState)}
          >
            {STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </header>
      <SongHistory key={state} songId={AUDIT_FIXTURE_SONG_ID} load={load} />
    </div>
  );
}
