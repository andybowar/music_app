import '@testing-library/jest-dom/vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ROW_PANEL_TITLE,
  useResourceOpener,
  useSongDetailCache,
  type SignedUrlResult,
} from '@/features/search/ui/RowPanels';
import { SONG_IDS, getSong } from '@/fixtures';
import type { ActionResult, Resource, SongDetail } from '@/types/domain';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

const song = getSong(SONG_IDS.thousandHallelujahs);
const songRef = { id: song.id, title: song.title };

function resource(patch: Partial<Resource>): Resource {
  return {
    id: '50000000-0000-4000-8000-0000000000aa',
    songId: song.id,
    songKeyId: null,
    kind: 'chord_chart',
    format: 'pdf',
    label: 'Chord chart',
    url: null,
    storagePath: 'songs/x/file.pdf',
    sizeBytes: 1000,
    mimeType: 'application/pdf',
    createdAt: '2026-01-01T00:00:00Z',
    ...patch,
  };
}

const signedOk = (url: string): SignedUrlResult => ({
  ok: true,
  data: { url, expiresAt: '2099-01-01T00:00:00Z' },
});

afterEach(cleanup);

describe('ROW_PANEL_TITLE', () => {
  it('uses sentence case', () => {
    for (const title of Object.values(ROW_PANEL_TITLE)) {
      expect(title[0]).toBe(title[0]!.toUpperCase());
      expect(title.slice(1)).toBe(title.slice(1).toLowerCase());
    }
  });
});

describe('useSongDetailCache', () => {
  it('fetches once per song and caches the detail', async () => {
    const load = vi.fn(async (): Promise<ActionResult<SongDetail>> => ({ ok: true, data: song }));
    const { result } = renderHook(() => useSongDetailCache(load));
    expect(result.current.get(song.id)).toBeUndefined();

    act(() => result.current.ensure(song.id));
    expect(result.current.get(song.id)).toEqual({ status: 'loading' });
    act(() => result.current.ensure(song.id)); // in flight: no second call
    await waitFor(() => expect(result.current.get(song.id)?.status).toBe('ready'));
    act(() => result.current.ensure(song.id)); // cached
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps failures retryable, including thrown errors', async () => {
    const load = vi
      .fn<() => Promise<ActionResult<SongDetail>>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ ok: true, data: song });
    const { result } = renderHook(() => useSongDetailCache(load));
    act(() => result.current.ensure(song.id));
    await waitFor(() =>
      expect(result.current.get(song.id)).toEqual({
        status: 'error',
        message: 'Something went wrong. Please try again.',
      }),
    );
    act(() => result.current.ensure(song.id));
    await waitFor(() => expect(result.current.get(song.id)?.status).toBe('ready'));
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('useResourceOpener', () => {
  const getUrl = vi.fn<(id: string) => Promise<SignedUrlResult>>();
  const open = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', open);
    getUrl.mockResolvedValue(signedOk('https://files.test/a'));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('opens an uploaded PDF in the viewer and reuses its signed URL', async () => {
    const { result } = renderHook(() => useResourceOpener(getUrl));
    const pdf = resource({});
    await act(() => result.current.open(songRef, pdf));
    expect(result.current.pdf).toEqual({
      song: songRef,
      resource: pdf,
      url: 'https://files.test/a',
    });
    act(() => result.current.closePdf());
    expect(result.current.pdf).toBeNull();
    await act(() => result.current.open(songRef, pdf));
    expect(getUrl).toHaveBeenCalledTimes(1);
  });

  it('plays uploaded audio through a signed URL and hosted audio directly', async () => {
    const { result } = renderHook(() => useResourceOpener(getUrl));
    const mp3 = resource({ id: 'mp3', kind: 'audio', format: 'mp3', label: 'MP3' });
    await act(() => result.current.open(songRef, mp3));
    expect(result.current.audio?.url).toBe('https://files.test/a');

    const hosted = resource({
      id: 'hosted',
      kind: 'audio',
      format: 'url',
      label: 'Hosted',
      storagePath: null,
      url: 'https://cdn.test/a.mp3',
    });
    await act(() => result.current.open(songRef, hosted));
    expect(getUrl).toHaveBeenCalledTimes(1);
    act(() => result.current.closeAudio());
    expect(result.current.audio).toBeNull();
  });

  it('opens links in a new tab', async () => {
    const { result } = renderHook(() => useResourceOpener(getUrl));
    const link = resource({
      kind: 'video_link',
      format: 'url',
      storagePath: null,
      url: 'https://youtu.be/x',
    });
    await act(() => result.current.open(songRef, link));
    expect(open).toHaveBeenCalledWith('https://youtu.be/x', '_blank', 'noopener,noreferrer');
    expect(getUrl).not.toHaveBeenCalled();
  });

  it('downloads projection files', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { result } = renderHook(() => useResourceOpener(getUrl));
    const slides = resource({ kind: 'projection', format: 'pptx', label: 'Slides' });
    await act(() => result.current.open(songRef, slides));
    expect(click).toHaveBeenCalled();
    expect(result.current.pdf).toBeNull();
    click.mockRestore();
  });

  it('toasts when the signed URL fails', async () => {
    getUrl.mockResolvedValueOnce({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'No access.' },
    });
    getUrl.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useResourceOpener(getUrl));
    await act(() => result.current.open(songRef, resource({})));
    expect(toastError).toHaveBeenCalledWith("Couldn't open Chord chart", {
      description: 'No access.',
    });
    await act(() => result.current.open(songRef, resource({})));
    expect(toastError).toHaveBeenLastCalledWith("Couldn't open Chord chart", {
      description: 'Something went wrong. Please try again.',
    });
    expect(result.current.pdf).toBeNull();
    expect(result.current.pending).toBeNull();
  });

  it('does nothing for a file with no source', async () => {
    const { result } = renderHook(() => useResourceOpener(getUrl));
    await act(() => result.current.open(songRef, resource({ storagePath: null, url: null })));
    expect(getUrl).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
