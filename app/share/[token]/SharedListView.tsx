'use client';

import { LockIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ResponsivePanel } from '@/components/ResponsivePanel';
import { SongRow } from '@/components/song/SongRow';
import { displayKey } from '@/components/song/KeyBadge';
import { ComposerPanel } from '@/components/song/panels/ComposerPanel';
import { RESOURCE_KIND_LABEL } from '@/components/song/panels/ResourcesPanel';
import { Button } from '@/components/ui/button';
import { FirstChords, UploadPrompt } from '@/features/lists/ui/ItemOverrideEditor';
import type { Composer, ResolvedItem, UUID } from '@/types/domain';

import { formatEventDate, signInHref, songCountLabel, type SharedList } from './shared';

export interface SharedListViewProps {
  list: SharedList;
}

type PanelKind = 'key' | 'title' | 'composer' | 'resources' | 'usage';

const PANEL_TITLE: Record<PanelKind, string> = {
  key: 'Key and first chords',
  title: 'First lines',
  composer: 'Composers',
  resources: 'Resources',
  usage: 'Branch usage',
};

const TYPE_LABEL = { setlist: 'Setlist', playlist: 'Playlist' } as const;

const linkClass =
  'inline-flex min-h-tap items-center rounded-md text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring';

/** "Sign in to open files" (REQ-SHARE-03): every file stays behind sign-in. */
function SignInLink({ href, label = 'Sign in to open files' }: { href: string; label?: string }) {
  return (
    <Link href={href} className={linkClass}>
      {label}
    </Link>
  );
}

/** Row composers carry no ids; the panel only needs name and POP membership. */
function panelComposers(song: ResolvedItem['song']): Composer[] {
  return song.composers.map((c) => ({ id: '', name: c.name, popMember: c.popMember }));
}

function LockedResources({ resolved, href }: { resolved: ResolvedItem; href: string }) {
  const { resources } = resolved;
  return (
    <div className="flex flex-col gap-3">
      {resources.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files for this song yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {resources.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
              <LockIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 break-words">{r.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {RESOURCE_KIND_LABEL[r.kind]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {resolved.needsUpload && resolved.key && (
        <UploadPrompt songId={resolved.song.id} songKey={resolved.key} linked={false} />
      )}
      <p className="text-sm text-muted-foreground">
        Sheet music, audio, projection files and lyrics are for signed-in members.
      </p>
      <SignInLink href={href} />
    </div>
  );
}

function PanelBody({
  kind,
  resolved,
  href,
}: {
  kind: PanelKind;
  resolved: ResolvedItem;
  href: string;
}) {
  switch (kind) {
    case 'key':
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Key for this list: </span>
            <span className="font-semibold">
              {resolved.key ? displayKey(resolved.key) : 'not set'}
            </span>
          </p>
          <FirstChords chords={resolved.firstChords} />
          {resolved.needsUpload && resolved.key && (
            <UploadPrompt songId={resolved.song.id} songKey={resolved.key} linked={false} />
          )}
        </div>
      );
    case 'title':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            First lines and lyrics are for signed-in members.
          </p>
          <SignInLink href={href} label="Sign in to see the lyrics" />
        </div>
      );
    case 'composer':
      return <ComposerPanel composers={panelComposers(resolved.song)} />;
    case 'usage':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <span className="text-muted-foreground">Added by </span>
            {resolved.song.addedByBranchCode === null ? (
              <span className="text-muted-foreground">unknown branch</span>
            ) : (
              <span className="font-semibold uppercase">{resolved.song.addedByBranchCode}</span>
            )}
          </p>
          <SignInLink href={href} label="Sign in to see branch usage" />
        </div>
      );
    case 'resources':
      return <LockedResources resolved={resolved} href={href} />;
  }
}

/**
 * The public, read-only view of a shared list (SHR-02; REQ-SHARE-01, REQ-SHARE-03): the list's
 * name, event date and branch, then each song with this list's key, BPM and energy (overrides
 * styled as such) and first chords. Row taps open what a signed-out reader may see; files,
 * lyrics and usage point to sign-in.
 */
export function SharedListView({ list }: SharedListViewProps) {
  const [panel, setPanel] = useState<{ kind: PanelKind; itemId: UUID } | null>(null);
  const href = signInHref(list);
  const current = panel ? list.items.find((i) => i.item.id === panel.itemId) : undefined;
  const open = (resolved: ResolvedItem, kind: PanelKind) =>
    setPanel({ kind, itemId: resolved.item.id });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-3 py-6 sm:px-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">
            Shared {TYPE_LABEL[list.type].toLowerCase()}
          </p>
          <h1 className="text-2xl font-semibold break-words">{list.name}</h1>
          <p className="text-sm text-muted-foreground">
            {list.eventDate && (
              <>
                <time dateTime={list.eventDate} suppressHydrationWarning>
                  {formatEventDate(list.eventDate)}
                </time>
                {' · '}
              </>
            )}
            {songCountLabel(list.items.length)}
            {list.branchCode && (
              <>
                {' · '}
                <span className="uppercase">{list.branchCode}</span>
              </>
            )}
          </p>
        </div>
        <Button asChild className="min-h-tap shrink-0">
          <Link href={href}>Sign in to open files</Link>
        </Button>
      </header>

      {list.items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
          <p className="font-medium">No songs in this {TYPE_LABEL[list.type].toLowerCase()} yet.</p>
          <p className="text-sm text-muted-foreground">Check back later.</p>
        </div>
      ) : (
        <ol aria-label={`Songs in ${list.name}`} className="flex flex-col gap-1">
          {list.items.map((resolved) => (
            <li key={resolved.item.id} data-item-id={resolved.item.id}>
              <SongRow
                song={resolved.song}
                resolved={resolved}
                onKey={() => open(resolved, 'key')}
                onTitle={() => open(resolved, 'title')}
                onComposer={() => open(resolved, 'composer')}
                onResources={() => open(resolved, 'resources')}
                onUsage={() => open(resolved, 'usage')}
              />
              <div className="flex flex-col gap-1 px-2 pt-1 pb-2">
                <FirstChords chords={resolved.firstChords} className="text-xs" />
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="text-sm text-muted-foreground">
        This is a read-only copy shared from the Worship Library.
      </p>

      <ResponsivePanel
        open={panel !== null && current !== undefined}
        onOpenChange={(o) => !o && setPanel(null)}
        title={panel && current ? `${PANEL_TITLE[panel.kind]} · ${current.song.title}` : ''}
      >
        {panel && current ? <PanelBody kind={panel.kind} resolved={current} href={href} /> : null}
      </ResponsivePanel>
    </main>
  );
}
