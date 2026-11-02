'use client';

import { useCallback, useEffect, useState } from 'react';

import type { ActionResult, AuditEntry, UUID } from '@/types/domain';

import { loadAuditTrail } from '../actions';
import { TRAIL_LIMIT } from '../trail';
import { AuditTimeline, AuditTimelineError, AuditTimelineSkeleton } from './AuditTimeline';

export type LoadAuditTrail = (
  entity: string,
  entityId: UUID,
) => Promise<ActionResult<AuditEntry[]>>;

export interface SongHistoryProps {
  songId: UUID;
  /** Defaults to the `loadAuditTrail` server action; galleries and tests pass a fake. */
  load?: LoadAuditTrail;
  formatDate?(iso: string): string;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; entries: AuditEntry[] };

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * History tab of the song page (LIB-19; REQ-LIB-12). Loads the song's audit trail when it mounts
 * (the tab content mounts when the tab is opened), with loading, empty and error states.
 */
export function SongHistory({ songId, load = loadAuditTrail, formatDate }: SongHistoryProps) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    load('song', songId)
      .then((result) => {
        if (!live) return;
        setState(
          result.ok
            ? { status: 'ready', entries: result.data }
            : { status: 'error', message: result.error.message || GENERIC_ERROR },
        );
      })
      .catch(() => {
        if (live) setState({ status: 'error', message: GENERIC_ERROR });
      });
    return () => {
      live = false;
    };
  }, [load, songId, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  if (state.status === 'loading') return <AuditTimelineSkeleton />;
  if (state.status === 'error')
    return <AuditTimelineError message={state.message} onRetry={retry} />;
  return (
    <AuditTimeline
      entries={state.entries}
      truncated={state.entries.length >= TRAIL_LIMIT}
      formatDate={formatDate}
    />
  );
}
