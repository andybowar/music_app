import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult, AuditEntry } from '@/types/domain';

import { AUDIT_FIXTURE_SONG_ID, songAuditTrail } from '../fixtures';
import { TRAIL_LIMIT } from '../trail';
import { AuditTimeline } from './AuditTimeline';
import { SongHistory } from './SongHistory';

// The default loader is a server action; these tests always inject one.
vi.mock('../actions', () => ({ loadAuditTrail: vi.fn() }));

afterEach(cleanup);

const fmt = (iso: string) => `at ${iso.slice(0, 10)}`;
const ok = (data: AuditEntry[]): ActionResult<AuditEntry[]> => ({ ok: true, data });

describe('AuditTimeline', () => {
  it('shows each entry with who, when and what changed', () => {
    render(<AuditTimeline entries={songAuditTrail} formatDate={fmt} />);
    const items = within(screen.getByRole('list', { name: 'Change history' })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(songAuditTrail.length);

    const edit = items.find((li) => within(li).queryByText('Edited song details'))!;
    expect(within(edit).getByText('2026-10-14', { exact: false })).toBeInTheDocument();
    expect(within(edit).getByText(songAuditTrail[3]!.actorName)).toBeInTheDocument();
    expect(within(edit).getByText('Tempo (BPM)')).toBeInTheDocument();
    expect(within(edit).getByText('72')).toBeInTheDocument();
    expect(within(edit).getByText('76')).toBeInTheDocument();
    expect(within(edit).getByText("High Energy 'Worship'")).toBeInTheDocument();
    expect(within(edit).getByText('Changed Bridge')).toBeInTheDocument();
    // Lyric text itself is never shown.
    expect(within(edit).queryByText(/sample bridge text/)).not.toBeInTheDocument();

    expect(screen.getByText('Added key A')).toBeInTheDocument();
    expect(screen.getByText('Removed file “Rehearsal track”')).toBeInTheDocument();
    expect(screen.getByText('Added link “Live recording”')).toBeInTheDocument();
    expect(screen.getAllByRole('time')[0]).toHaveAttribute(
      'datetime',
      songAuditTrail[0]!.createdAt,
    );
  });

  it('marks set, removed and changed values for screen readers', () => {
    render(
      <AuditTimeline
        formatDate={fmt}
        entries={[
          {
            ...songAuditTrail[3]!,
            diff: {
              title: { from: 'Old', to: 'New' },
              energyNotes: { from: null, to: 'Notes' },
              sourceGroup: { from: 'Group', to: null },
            },
          },
        ]}
      />,
    );
    expect(screen.getByText('Changed from')).toBeInTheDocument();
    expect(screen.getByText('Set to')).toBeInTheDocument();
    expect(screen.getByText('Removed')).toBeInTheDocument();
    expect(screen.getByText('Group').tagName).toBe('DEL');
  });

  it('has an empty state', () => {
    render(<AuditTimeline entries={[]} />);
    expect(screen.getByText('No changes recorded yet.')).toBeInTheDocument();
  });

  it('notes when the list was cut', () => {
    render(<AuditTimeline entries={songAuditTrail.slice(0, 2)} truncated />);
    expect(screen.getByText('Showing the latest 2 changes.')).toBeInTheDocument();
  });

  it('formats dates in the locale by default and tolerates bad dates', () => {
    render(
      <AuditTimeline
        entries={[
          { ...songAuditTrail[0]!, id: 'a' },
          { ...songAuditTrail[1]!, id: 'b', createdAt: 'not a date' },
        ]}
      />,
    );
    const times = screen.getAllByRole('time');
    expect(times[0]!.textContent).not.toBe(songAuditTrail[0]!.createdAt);
    expect(times[1]).toHaveTextContent('not a date');
  });
});

describe('SongHistory', () => {
  it('shows a skeleton, then the song trail', async () => {
    const load = vi.fn(async () => ok(songAuditTrail));
    render(<SongHistory songId={AUDIT_FIXTURE_SONG_ID} load={load} formatDate={fmt} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading change history…');
    expect(await screen.findByText('Created the song')).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith('song', AUDIT_FIXTURE_SONG_ID);
    expect(screen.queryByText(/Showing the latest/)).not.toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    render(<SongHistory songId={AUDIT_FIXTURE_SONG_ID} load={async () => ok([])} />);
    expect(await screen.findByText('No changes recorded yet.')).toBeInTheDocument();
  });

  it('notes a cut trail at the server limit', async () => {
    const many = Array.from({ length: TRAIL_LIMIT }, (_, i) => ({
      ...songAuditTrail[0]!,
      id: `e${i}`,
    }));
    render(<SongHistory songId={AUDIT_FIXTURE_SONG_ID} load={async () => ok(many)} />);
    expect(
      await screen.findByText(`Showing the latest ${TRAIL_LIMIT} changes.`),
    ).toBeInTheDocument();
  });

  it('shows an action error and retries', async () => {
    const load = vi
      .fn<(e: string, id: string) => Promise<ActionResult<AuditEntry[]>>>()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'You do not have permission.' },
      })
      .mockResolvedValueOnce(ok(songAuditTrail));
    render(<SongHistory songId={AUDIT_FIXTURE_SONG_ID} load={load} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load the change history");
    expect(alert).toHaveTextContent('You do not have permission.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Created the song')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shows a generic error when the request fails or has no message', async () => {
    render(
      <SongHistory
        songId={AUDIT_FIXTURE_SONG_ID}
        load={async () => {
          throw new Error('network');
        }}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    cleanup();
    render(
      <SongHistory
        songId={AUDIT_FIXTURE_SONG_ID}
        load={async () => ({ ok: false, error: { code: 'INTERNAL', message: '' } })}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
  });

  it('ignores a response that arrives after unmount', async () => {
    let resolve!: (r: ActionResult<AuditEntry[]>) => void;
    let reject!: (e: unknown) => void;
    const first = render(
      <SongHistory
        songId={AUDIT_FIXTURE_SONG_ID}
        load={() => new Promise((res) => (resolve = res))}
      />,
    );
    first.unmount();
    resolve(ok(songAuditTrail));
    const second = render(
      <SongHistory
        songId={AUDIT_FIXTURE_SONG_ID}
        load={() => new Promise((_, rej) => (reject = rej))}
      />,
    );
    second.unmount();
    reject(new Error('late'));
    await Promise.resolve();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
