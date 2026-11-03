'use client';

import { useState } from 'react';

import { SharedListView } from '@/app/share/[token]/SharedListView';
import { toSharedList, type SharedList } from '@/app/share/[token]/shared';
import { ShareLoadError, ShareNotFound } from '@/app/share/[token]/views';
import { Button } from '@/components/ui/button';
import { LIST_IDS, getItemsForList, getList, getSong } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';

function sharedOf(id: string): SharedList {
  return toSharedList({
    ...getList(id),
    items: getItemsForList(id).map((i) => resolveItemDisplay(getSong(i.songId), i)),
  });
}

const setlist = sharedOf(LIST_IDS.bg41926);

const VARIANTS = {
  setlist: { label: 'Setlist with overrides', render: () => <SharedListView list={setlist} /> },
  playlist: {
    label: 'Playlist',
    render: () => <SharedListView list={sharedOf(LIST_IDS.background1)} />,
  },
  empty: {
    label: 'Empty',
    render: () => <SharedListView list={{ ...setlist, items: [] }} />,
  },
  notFound: { label: 'Invalid link (404)', render: () => <ShareNotFound /> },
  error: { label: 'Load error', render: () => <ShareLoadError /> },
} as const;

type Variant = keyof typeof VARIANTS;

/** SHR-02 gallery: the public share page with fixture lists, plus its 404 and error states. */
export function SharePageGallery() {
  const [variant, setVariant] = useState<Variant>('setlist');
  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Share page variant"
        className="flex flex-wrap gap-2 border-b px-3 py-3 sm:px-4"
      >
        {(Object.keys(VARIANTS) as Variant[]).map((v) => (
          <Button
            key={v}
            size="sm"
            variant={v === variant ? 'default' : 'outline'}
            aria-pressed={v === variant}
            className="min-h-tap"
            onClick={() => setVariant(v)}
          >
            {VARIANTS[v].label}
          </Button>
        ))}
      </div>
      {VARIANTS[variant].render()}
    </div>
  );
}
