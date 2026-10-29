import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { thousandHallelujahs } from '@/fixtures';
import { MAX_UPLOAD_BYTES, type ActionResult, type Resource } from '@/types/domain';
import type { ResourceLinkInput } from '@/types/validation';
import {
  buildLinkInput,
  checkFile,
  formatFromFileName,
  kindsFor,
  nextLabel,
  parseYouTubeId,
  ResourcesSection,
  ResourcesSectionSkeleton,
  type PutFile,
  type ResourcesSectionProps,
} from './ResourcesSection';
import type { SongFormValue } from './types';

const song = thousandHallelujahs;
const keyD = song.keys[0]!;
const D = 'Key of D (primary)';
const PROJ = 'Projection (any key)';
const formKeys: SongFormValue['musical']['keys'] = song.keys.map(({ songId: _, ...k }) => k);
const value = (keys = formKeys): Partial<SongFormValue> => ({
  musical: { keys, tempoBpm: null, timeSignature: null, energyLevel: null, energyNotes: null },
});

const created = (over: Partial<Resource>): Resource => ({
  id: '9f000000-0000-4000-8000-000000000001',
  songId: song.id,
  songKeyId: keyD.id,
  kind: 'chord_chart',
  format: 'pdf',
  label: 'New',
  url: null,
  storagePath: 'songs/x/y/z.pdf',
  sizeBytes: 3,
  mimeType: 'application/pdf',
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
});

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const file = (name: string, type = 'application/pdf', size = 3) =>
  new File(['x'.repeat(size)], name, { type });

function setup(props: Partial<ResourcesSectionProps> = {}) {
  let ticket = 0;
  const api = {
    requestUpload: vi.fn(async () =>
      ok({ resourceId: `r${++ticket}`, uploadUrl: `https://up.invalid/${ticket}`, path: 'p' }),
    ),
    finalizeUpload: vi.fn(async () => ok(created({}))),
    deleteResource: vi.fn(async () => ok(undefined)),
    getSignedResourceUrl: vi.fn(async () => ok({ url: 'blob:x', expiresAt: '' })),
    addLink: vi.fn(async (i: ResourceLinkInput) =>
      ok(created({ ...i, id: '9f000000-0000-4000-8000-000000000002', format: 'url' })),
    ),
    updateLink: vi.fn(async (id: string, i: ResourceLinkInput) =>
      ok(created({ ...i, id, format: 'url', storagePath: null })),
    ),
    putFile: vi.fn<PutFile>(async (_u, _f, onProgress) => onProgress(1)),
    onResourcesChange: vi.fn(),
  };
  const user = userEvent.setup({ applyAccept: false });
  render(
    <ResourcesSection
      value={value()}
      onChange={() => {}}
      songId={song.id}
      initialResources={song.resources}
      {...api}
      {...props}
    />,
  );
  const block = (name: string) => within(screen.getByRole('region', { name }));
  return { api, user, block };
}

describe('pure helpers', () => {
  it('offers keyed kinds per key and only projection in the projection block', () => {
    expect(kindsFor(true, 'file')).toEqual([
      'full_score',
      'lead_sheet',
      'chord_chart',
      'audio',
      'instruction_link',
    ]);
    expect(kindsFor(true, 'link')).toEqual(['audio', 'video_link', 'instruction_link']);
    expect(kindsFor(false, 'file')).toEqual(['projection']);
    expect(kindsFor(false, 'link')).toEqual(['projection']);
  });

  it('reads the format from the extension', () => {
    expect(formatFromFileName('Song - D - Chord Chart.PDF')).toBe('pdf');
    expect(formatFromFileName('slides.pptx')).toBe('pptx');
    expect(formatFromFileName('notes.txt')).toBeNull();
    expect(formatFromFileName('noext')).toBeNull();
  });

  it('blocks kind/format/key combinations the schema rejects', () => {
    expect(checkFile('chord_chart', true, { name: 'a.pdf', size: 1 })).toBeNull();
    expect(checkFile('audio', true, { name: 'a.pdf', size: 1 })).toMatch(/Audio must be/);
    expect(checkFile('chord_chart', true, { name: 'a.mp3', size: 1 })).toMatch(/\.pdf/);
    expect(checkFile('projection', true, { name: 'a.pro', size: 1 })).toMatch(/Projection block/);
    expect(checkFile('chord_chart', false, { name: 'a.pdf', size: 1 })).toMatch(/Pick a key/);
    expect(checkFile('projection', false, { name: 'a.mdb', size: 1 })).toBeNull();
    expect(checkFile('lead_sheet', true, { name: 'a.pdf', size: 0 })).toMatch(/empty/);
    expect(checkFile('lead_sheet', true, { name: 'a.pdf', size: MAX_UPLOAD_BYTES + 1 })).toMatch(
      /50 MB/,
    );
  });

  it('numbers labels that are already used', () => {
    expect(nextLabel([], 'Chord chart')).toBe('Chord chart');
    expect(nextLabel(['chord chart', 'Chord chart 2'], 'Chord chart')).toBe('Chord chart 3');
  });

  it.each([
    ['https://www.youtube.com/watch?v=fakeVid0001&t=30s', 'fakeVid0001'],
    ['https://youtu.be/fakeVid0002?si=x', 'fakeVid0002'],
    ['https://m.youtube.com/shorts/fakeVid0003', 'fakeVid0003'],
    ['https://www.youtube.com/embed/fakeVid0004', 'fakeVid0004'],
    ['https://example.com/watch?v=fakeVid0001', null],
    ['https://www.youtube.com/watch?v=short', null],
    ['not a url', null],
  ])('parseYouTubeId(%s) → %s', (url, id) => {
    expect(parseYouTubeId(url)).toBe(id);
  });

  it('validates links with resourceLinkInputSchema', () => {
    const yt = buildLinkInput(song.id, keyD.id, {
      kind: 'video_link',
      label: ' ',
      url: 'https://youtu.be/fakeVid0001',
    });
    expect(yt).toEqual({
      ok: true,
      input: expect.objectContaining({ label: 'YouTube', songKeyId: keyD.id }),
    });
    const site = buildLinkInput(song.id, null, {
      kind: 'projection',
      label: '',
      url: 'https://www.example.com/deck',
    });
    expect(site.ok && site.input.label).toBe('example.com');
    const bad = buildLinkInput(song.id, null, { kind: 'video_link', label: 'x', url: 'ftp://x' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.fieldErrors.url).toEqual(['Enter a full web address starting with https://']);
      expect(bad.fieldErrors.songKeyId).toEqual(['A key is required']);
    }
  });
});

describe('ResourcesSection', () => {
  it('asks to save first on a new song', () => {
    setup({ songId: null });
    expect(screen.getByText(/Save to add files/)).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('puts keyed resources under their key and projection files in the projection block', () => {
    const { block } = setup();
    const rows = (name: string) =>
      block(name)
        .queryAllByRole('button', { name: /^Delete / })
        .map((b) => b.getAttribute('aria-label')!.slice('Delete '.length));
    expect(rows(D)).toContain('Full score');
    expect(rows(D)).toHaveLength(9);
    expect(rows('Key of Db')).toEqual(['Chord chart']);
    expect(rows('Key of E')).toEqual(['Chord chart', 'YouTube link 4']);
    expect(rows(PROJ)).toEqual(['ProPresenter', 'Lyric database', 'Slides']);
    expect(block(PROJ).queryByLabelText('File type')).not.toBeInTheDocument();
  });

  it('notes unsaved keys and lists resources of removed keys', () => {
    const unsaved = { ...formKeys[0]!, id: undefined, key: 'F' as const, isPrimary: false };
    render(
      <ResourcesSection
        value={value([formKeys[0]!, unsaved])}
        onChange={() => {}}
        songId={song.id}
        initialResources={song.resources}
        requestUpload={vi.fn()}
        finalizeUpload={vi.fn()}
        deleteResource={vi.fn()}
        getSignedResourceUrl={vi.fn()}
        addLink={vi.fn()}
        updateLink={vi.fn()}
      />,
    );
    const f = within(screen.getByRole('region', { name: 'Key of F' }));
    expect(f.getByText('Save the song to add files for this key.')).toBeInTheDocument();
    expect(f.queryByRole('button', { name: 'Choose file' })).not.toBeInTheDocument();
    const removed = within(screen.getByRole('region', { name: 'Removed keys' }));
    expect(removed.getAllByText('Chord chart')).toHaveLength(2); // Db and E
    expect(removed.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it('uploads a file with progress, then finalizes', async () => {
    let progress: (f: number) => void = () => {};
    let finish: () => void = () => {};
    const putFile = vi.fn<PutFile>(
      (_u, _f, onProgress) =>
        new Promise<void>((resolve) => {
          progress = onProgress;
          finish = resolve;
        }),
    );
    const { api, user, block } = setup({ putFile });
    await user.upload(block(D).getByLabelText(/^Upload Chord chart/), file('chart.pdf'));

    expect(api.requestUpload).toHaveBeenCalledWith({
      songId: song.id,
      songKeyId: keyD.id,
      kind: 'chord_chart',
      format: 'pdf',
      label: 'Chord chart 3',
      sizeBytes: 3,
      mimeType: 'application/pdf',
    });
    await waitFor(() => expect(putFile).toHaveBeenCalled());
    progress(0.5);
    expect(await block(D).findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    finish();
    await waitFor(() => expect(api.finalizeUpload).toHaveBeenCalledWith('r1'));
    expect(await block(D).findByText('New')).toBeInTheDocument();
    expect(block(D).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(api.onResourcesChange).toHaveBeenLastCalledWith([...song.resources, created({})]);
  });

  it('retries a failed upload from the start', async () => {
    const putFile = vi
      .fn<PutFile>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const { api, user, block } = setup({ putFile });
    await user.selectOptions(block(D).getByLabelText('File type'), 'audio');
    await user.type(block(D).getByLabelText('File label (optional)'), 'Rehearsal');
    await user.upload(block(D).getByLabelText(/^Upload Audio/), file('take.mp3', 'audio/mpeg'));
    expect(await block(D).findByRole('alert')).toHaveTextContent(/Upload failed/);
    await user.click(block(D).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.finalizeUpload).toHaveBeenCalledTimes(1));
    expect(api.requestUpload).toHaveBeenCalledTimes(2);
    expect(api.requestUpload).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'audio', format: 'mp3', label: 'Rehearsal' }),
    );
  });

  it('retries only finalize when the bytes are already uploaded', async () => {
    const finalizeUpload = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'INTERNAL', message: 'Boom' } })
      .mockResolvedValueOnce(ok(created({ label: 'Done' })));
    const { api, user, block } = setup({ finalizeUpload });
    await user.upload(block(D).getByLabelText(/^Upload/), file('a.pdf'));
    expect(await block(D).findByRole('alert')).toHaveTextContent('Boom');
    await user.click(block(D).getByRole('button', { name: 'Retry' }));
    expect(await block(D).findByText('Done')).toBeInTheDocument();
    expect(api.requestUpload).toHaveBeenCalledTimes(1);
    expect(api.putFile).toHaveBeenCalledTimes(1);
  });

  it('shows a refused upload request and lets you dismiss it', async () => {
    const requestUpload = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'FORBIDDEN' as const, message: 'Not allowed' },
    }));
    const { user, block } = setup({ requestUpload });
    await user.upload(block(D).getByLabelText(/^Upload/), file('a.pdf'));
    expect(await block(D).findByRole('alert')).toHaveTextContent('Not allowed');
    await user.click(block(D).getByRole('button', { name: /^Dismiss/ }));
    expect(block(D).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('blocks files whose format does not fit the kind', async () => {
    const { api, user, block } = setup();
    await user.upload(block(D).getByLabelText(/^Upload Chord chart/), file('a.mp3', 'audio/mpeg'));
    expect(block(D).getByText('a.mp3: Chord chart must be .pdf')).toBeInTheDocument();
    await user.upload(block(PROJ).getByLabelText(/^Upload Projection/), file('a.pdf'));
    expect(block(PROJ).getByText(/a\.pdf: Projection must be \.pro/)).toBeInTheDocument();
    expect(api.requestUpload).not.toHaveBeenCalled();
  });

  it('uploads projection files without a key', async () => {
    const { api, user, block } = setup();
    await user.upload(
      block(PROJ).getByLabelText(/^Upload Projection/),
      file('deck.pptx', 'application/vnd.ms-powerpoint'),
    );
    expect(api.requestUpload).toHaveBeenCalledWith(
      expect.objectContaining({ songKeyId: null, kind: 'projection', format: 'pptx' }),
    );
  });

  it('adds a YouTube link with a thumbnail preview, using the keyboard', async () => {
    const { api, user, block } = setup();
    const url = block(D).getByLabelText('Link URL');
    await user.click(url);
    await user.keyboard('https://youtu.be/fakeVid0001');
    expect(block(D).getByRole('img', { name: 'YouTube thumbnail' })).toHaveAttribute(
      'src',
      'https://i.ytimg.com/vi/fakeVid0001/mqdefault.jpg',
    );
    await user.keyboard('{Enter}');
    expect(api.addLink).toHaveBeenCalledWith({
      songId: song.id,
      songKeyId: keyD.id,
      kind: 'video_link',
      label: 'YouTube',
      url: 'https://youtu.be/fakeVid0001',
    });
    await waitFor(() => expect(url).toHaveValue(''));
  });

  it('validates links before calling addLink and shows server field errors', async () => {
    const addLink = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'VALIDATION' as const,
        message: 'Invalid',
        fieldErrors: { url: ['That site is blocked'] },
      },
    }));
    const { user, block } = setup({ addLink });
    const url = block(PROJ).getByLabelText('Link URL');
    await user.type(url, 'slides{Enter}');
    expect(block(PROJ).getByText(/full web address/)).toBeInTheDocument();
    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect(addLink).not.toHaveBeenCalled();
    await user.clear(url);
    await user.type(url, 'https://example.com/deck{Enter}');
    expect(await block(PROJ).findByText('That site is blocked')).toBeInTheDocument();
    expect(addLink).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'projection', songKeyId: null }),
    );
  });

  it('edits a link in place', async () => {
    const { api, user, block } = setup();
    const link = song.resources.find((r) => r.label === 'YouTube: Hillsong 7/5/22')!;
    await user.click(block(D).getByRole('button', { name: `Edit ${link.label}` }));
    const form = within(screen.getByRole('group', { name: `Edit link ${link.label}` }));
    expect(form.getByLabelText('Link URL')).toHaveValue(link.url);
    await user.clear(form.getByLabelText('Label (optional)'));
    await user.type(form.getByLabelText('Label (optional)'), 'Live');
    await user.click(form.getByRole('button', { name: 'Save link' }));
    expect(api.updateLink).toHaveBeenCalledWith(
      link.id,
      expect.objectContaining({ label: 'Live', url: link.url }),
    );
    expect(await block(D).findByText('Live')).toBeInTheDocument();
  });

  it('cancels editing with Escape', async () => {
    const { user, block } = setup();
    await user.click(block('Key of E').getByRole('button', { name: 'Edit YouTube link 4' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: /^Edit link/ })).not.toBeInTheDocument();
  });

  it('removes a resource after confirming', async () => {
    const { api, user, block } = setup();
    const score = song.resources.find((r) => r.label === 'Full score')!;
    await user.click(block(D).getByRole('button', { name: 'Delete Full score' }));
    await user.click(block(D).getByRole('button', { name: 'Keep' }));
    expect(api.deleteResource).not.toHaveBeenCalled();
    await user.click(block(D).getByRole('button', { name: 'Delete Full score' }));
    await user.click(block(D).getByRole('button', { name: 'Remove Full score' }));
    expect(api.deleteResource).toHaveBeenCalledWith(score.id);
    await waitFor(() =>
      expect(block(D).queryByRole('button', { name: 'Delete Full score' })).not.toBeInTheDocument(),
    );
  });

  it('keeps a resource when delete fails', async () => {
    const deleteResource = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'FORBIDDEN' as const, message: 'No' },
    }));
    const { user, block } = setup({ deleteResource });
    await user.click(block(PROJ).getByRole('button', { name: 'Delete Slides' }));
    await user.click(block(PROJ).getByRole('button', { name: 'Remove Slides' }));
    expect(await block(PROJ).findByRole('button', { name: 'Delete Slides' })).toBeInTheDocument();
  });

  it('plays audio inline after fetching a signed URL', async () => {
    const { api, user, block } = setup();
    const mp3 = song.resources.find((r) => r.label === 'MP3 D 1')!;
    await user.click(block(D).getByRole('button', { name: 'Open MP3 D 1' }));
    expect(api.getSignedResourceUrl).toHaveBeenCalledWith(mp3.id);
    expect(await block(D).findByRole('button', { name: 'Play MP3 D 1' })).toBeInTheDocument();
  });

  it('shows section errors and supports disabling', () => {
    setup({ errors: { resources: ['Some files could not be saved'] }, disabled: true });
    expect(screen.getByText('Some files could not be saved')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Choose file' })[0]).toBeDisabled();
  });

  it('has a loading skeleton', () => {
    render(<ResourcesSectionSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading files and links' })).toBeInTheDocument();
  });
});
