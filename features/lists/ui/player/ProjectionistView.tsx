'use client';

import { DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import { displayKey } from '@/components/song/KeyBadge';
import { openPlan } from '@/features/songs/ui/SongPage';
import { SECTION_LABEL } from '@/types/domain';
import type { ResolvedItem, Resource, SongDetail } from '@/types/domain';

import { SECTION_SHORT, projectionResources, sectionCues } from './charts';

export interface ProjectionistViewProps {
  items: ResolvedItem[];
  details: Map<string, SongDetail>;
  index: number;
  onOpenResource(r: Resource): void;
}

/**
 * The projectionist's view (LIST-11): the whole running order with the current song marked.
 * Each song shows its arrangement, each section's first line (to find the slide) and its
 * projection files, which open in ProPresenter, PowerPoint and the like outside the browser.
 */
export function ProjectionistView({
  items,
  details,
  index,
  onOpenResource,
}: ProjectionistViewProps) {
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [index]);

  return (
    <ol aria-label="Running order" className="flex flex-col gap-3">
      {items.map((resolved, i) => {
        const detail = details.get(resolved.song.id);
        const current = i === index;
        const files = projectionResources(resolved);
        return (
          <li
            key={resolved.item.id}
            ref={current ? currentRef : undefined}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'scroll-mt-2 rounded-lg border p-3',
              current ? 'border-2 border-foreground bg-muted/40' : 'border-border',
            )}
          >
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
              <h3 className="text-lg font-semibold">{resolved.song.title}</h3>
              {resolved.key && (
                <span className="text-sm text-muted-foreground">
                  Key {displayKey(resolved.key)}
                </span>
              )}
              {current && <span className="text-sm font-medium">Now</span>}
            </div>

            {detail && detail.arrangement.length > 0 ? (
              <p className="mt-1 text-sm">
                <span className="sr-only">Order: </span>
                {detail.arrangement.map((s, n) => (
                  <span key={n}>
                    {n > 0 && <span aria-hidden> · </span>}
                    <abbr title={SECTION_LABEL[s]} className="font-medium no-underline">
                      {SECTION_SHORT[s]}
                    </abbr>
                  </span>
                ))}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No arrangement.</p>
            )}

            {detail && sectionCues(detail).length > 0 && (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                {sectionCues(detail).map(({ section, line }) => (
                  <div key={section} className="contents">
                    <dt className="font-medium">{SECTION_LABEL[section]}</dt>
                    <dd className="min-w-0 truncate text-muted-foreground">{line}</dd>
                  </div>
                ))}
              </dl>
            )}
            {!detail && (
              <p className="mt-2 text-sm text-muted-foreground">
                Lyrics aren’t available for this song.
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              {files.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projection files.</p>
              ) : (
                files.map((r) => (
                  <Button
                    key={r.id}
                    variant="outline"
                    size="sm"
                    className="min-h-tap"
                    onClick={() => onOpenResource(r)}
                  >
                    {openPlan(r).type === 'link' ? (
                      <ExternalLinkIcon aria-hidden />
                    ) : (
                      <DownloadIcon aria-hidden />
                    )}
                    {r.label}
                  </Button>
                ))
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
