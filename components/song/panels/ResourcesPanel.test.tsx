import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SONG_IDS, getSong, thousandHallelujahs } from '@/fixtures';
import type { Resource } from '@/types/domain';
import {
  ResourcesPanel,
  ResourcesPanelSkeleton,
  groupResources,
  resourceAction,
  resourceDetail,
  resourceGroup,
} from './ResourcesPanel';

afterEach(cleanup);

const song = thousandHallelujahs;
const base = song.resources[0]!;
const make = (over: Partial<Resource>): Resource => ({ ...base, ...over });

describe('resourceGroup', () => {
  it.each([
    ['full_score', 'pdf', 'sheet_music'],
    ['lead_sheet', 'pdf', 'sheet_music'],
    ['chord_chart', 'pdf', 'sheet_music'],
    ['instruction_link', 'pdf', 'sheet_music'],
    ['instruction_link', 'mp3', 'audio'],
    ['instruction_link', 'url', 'audio'],
    ['audio', 'mp3', 'audio'],
    ['video_link', 'url', 'audio'],
    ['projection', 'pro', 'projection'],
    ['projection', 'url', 'projection'],
  ] as const)('%s/%s → %s', (kind, format, group) => {
    expect(resourceGroup({ kind, format })).toBe(group);
  });
});

describe('resourceAction', () => {
  it('maps formats to what opening does', () => {
    expect(resourceAction(make({ format: 'pdf' }))).toBe('view');
    expect(resourceAction(make({ format: 'mp3' }))).toBe('play');
    expect(resourceAction(make({ format: 'm4a' }))).toBe('play');
    expect(resourceAction(make({ format: 'pro' }))).toBe('download');
    expect(resourceAction(make({ format: 'pptx' }))).toBe('download');
    expect(
      resourceAction(make({ format: 'url', url: 'https://example.com', storagePath: null })),
    ).toBe('link');
  });

  it('flags resources with nothing to open', () => {
    expect(resourceAction(make({ format: 'url', url: null }))).toBe('unavailable');
    expect(resourceAction(make({ format: 'pdf', url: null, storagePath: null }))).toBe(
      'unavailable',
    );
  });
});

describe('resourceDetail', () => {
  it('drops the kind when the label already says it', () => {
    expect(resourceDetail({ kind: 'lead_sheet', format: 'pdf', label: 'Lead sheet' })).toBe('PDF');
    expect(resourceDetail({ kind: 'chord_chart', format: 'pdf', label: 'Capo 2' })).toBe(
      'Chord chart · PDF',
    );
    expect(resourceDetail({ kind: 'audio', format: 'mp3', label: 'MP3 D 1' })).toBe('Audio');
    expect(resourceDetail({ kind: 'projection', format: 'pro', label: 'ProPresenter' })).toBe(
      'Projection',
    );
    expect(resourceDetail({ kind: 'lead_sheet', format: 'pdf', label: 'Capo PDF' })).toBe(
      'Lead sheet',
    );
  });
});

describe('groupResources', () => {
  it('orders groups, splits by key in key order and hides empty groups', () => {
    const groups = groupResources(song.resources, song.keys);
    expect(groups.map((g) => g.id)).toEqual(['sheet_music', 'audio', 'projection']);
    const sheet = groups[0]!;
    const keyOrder = song.keys.map((k) => k.id);
    const bucketKeys = sheet.byKey.map((b) => b.key!.id);
    expect(bucketKeys).toEqual(keyOrder.filter((id) => bucketKeys.includes(id)));
    for (const b of sheet.byKey) {
      expect(b.resources.every((r) => r.songKeyId === b.key!.id)).toBe(true);
    }
    expect(groups[2]!.byKey).toHaveLength(1);
    expect(groups[2]!.byKey[0]!.key).toBeNull();
  });

  it('sorts by kind then label within a key', () => {
    const k = song.keys[0]!;
    const rs = [
      make({ id: 'c', kind: 'chord_chart', label: 'B', songKeyId: k.id }),
      make({ id: 'a', kind: 'full_score', label: 'Z', songKeyId: k.id }),
      make({ id: 'b', kind: 'chord_chart', label: 'A', songKeyId: k.id }),
    ];
    expect(groupResources(rs, [k])[0]!.byKey[0]!.resources.map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('puts unknown or missing keys under "Any key"', () => {
    const k = song.keys[0]!;
    const rs = [
      make({ id: 'x', kind: 'audio', format: 'mp3', songKeyId: 'not-a-key' }),
      make({ id: 'y', kind: 'audio', format: 'mp3', songKeyId: k.id }),
    ];
    const [audio] = groupResources(rs, [k]);
    expect(audio!.byKey.map((b) => b.key?.id ?? null)).toEqual([k.id, null]);
  });

  it('returns nothing for no resources', () => {
    expect(groupResources([], song.keys)).toEqual([]);
  });
});

describe('ResourcesPanel', () => {
  it('renders groups with key sub-groups and opens a resource', async () => {
    const onOpen = vi.fn();
    const onShowLyrics = vi.fn();
    render(
      <ResourcesPanel
        resources={song.resources}
        keys={song.keys}
        onOpen={onOpen}
        onShowLyrics={onShowLyrics}
      />,
    );
    for (const name of ['Lyrics', 'Sheet music', 'Audio', 'Projection']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    const sheet = screen.getByRole('region', { name: 'Sheet music' });
    const usual = within(sheet).getByRole('group', { name: 'Sheet music, Key D (usual)' });
    expect(within(usual).getByText('Key D (usual)')).toBeInTheDocument();

    const fullScore = within(usual).getByRole('button', { name: /^Full score, PDF, opens viewer/ });
    await userEvent.click(fullScore);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ kind: 'full_score' }));

    await userEvent.click(screen.getByRole('button', { name: 'Show lyrics' }));
    expect(onShowLyrics).toHaveBeenCalledOnce();
    expect(screen.queryByText('No files yet')).not.toBeInTheDocument();
  });

  it('describes projection files as downloads and links as new tabs', () => {
    const revive = getSong(SONG_IDS.reviveThisLand);
    render(
      <ResourcesPanel
        resources={[...song.resources, ...revive.resources]}
        keys={song.keys}
        onOpen={() => {}}
        onShowLyrics={() => {}}
      />,
    );
    const projection = screen.getByRole('region', { name: 'Projection' });
    expect(within(projection).getAllByRole('button', { name: /downloads$/ }).length).toBe(3);
    expect(within(projection).getByRole('button', { name: /opens in a new tab$/ })).toBeVisible();
  });

  it('shows "No files yet" and the add-files slot when there are no files', () => {
    const empty = getSong(SONG_IDS.beExaltedOGod);
    render(
      <ResourcesPanel
        resources={empty.resources}
        keys={empty.keys}
        onOpen={() => {}}
        onShowLyrics={() => {}}
        addFilesSlot={<a href="#add-files">Add files</a>}
      />,
    );
    expect(screen.getByText('No files yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add files' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Sheet music' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Lyrics' })).toBeInTheDocument();
  });

  it('hides Lyrics when there are none and omits the slot when not given', () => {
    render(
      <ResourcesPanel
        resources={[]}
        keys={[]}
        onOpen={() => {}}
        onShowLyrics={() => {}}
        hasLyrics={false}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Lyrics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('No files yet')).toBeInTheDocument();
  });

  it('disables a file with nothing to open', async () => {
    const onOpen = vi.fn();
    const broken = make({ id: 'broken', label: 'Missing chart', storagePath: null, url: null });
    render(
      <ResourcesPanel
        resources={[broken]}
        keys={song.keys}
        onOpen={onOpen}
        onShowLyrics={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: /Missing chart.*file unavailable/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText('File unavailable')).toBeInTheDocument();
    await userEvent.click(btn);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('is keyboard operable', async () => {
    const onOpen = vi.fn();
    const onShowLyrics = vi.fn();
    render(
      <ResourcesPanel
        resources={song.resources}
        keys={song.keys}
        onOpen={onOpen}
        onShowLyrics={onShowLyrics}
      />,
    );
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Show lyrics' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onShowLyrics).toHaveBeenCalledOnce();
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe('ResourcesPanelSkeleton', () => {
  it('announces loading', () => {
    render(<ResourcesPanelSkeleton />);
    expect(screen.getByLabelText('Loading files')).toHaveAttribute('aria-busy', 'true');
  });
});
