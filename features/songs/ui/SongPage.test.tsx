import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PdfDocumentProps } from '@/components/media/PdfDocument';
import { SONG_IDS, getSong } from '@/fixtures';
import { ENERGY_META, type Resource, type SongDetail, type UUID } from '@/types/domain';

import {
  SongPage,
  SongPageError,
  SongPageSkeleton,
  openPlan,
  themesBySection,
  type SignedUrlResult,
} from './SongPage';

// pdf.js can't run in jsdom: a fake document that "loads" one page.
vi.mock('@/components/media/PdfDocument', () => ({
  PdfDocument: ({ pageNumber, onLoadSuccess }: PdfDocumentProps) => {
    useEffect(() => {
      onLoadSuccess(1);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per mount, like react-pdf
    }, []);
    return <div data-testid="pdf-page" data-page={pageNumber} />;
  },
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
});

afterEach(() => {
  cleanup();
  toastError.mockReset();
  vi.restoreAllMocks();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
});

const full = getSong(SONG_IDS.thousandHallelujahs);
const empty = getSong(SONG_IDS.beExaltedOGod);
const byLabel = (song: SongDetail, label: string): Resource =>
  song.resources.find((r) => r.label === label)!;

function signer(fail = false) {
  return vi.fn(async (id: UUID): Promise<SignedUrlResult> =>
    fail
      ? { ok: false, error: { code: 'NOT_FOUND', message: 'File not found.' } }
      : {
          ok: true,
          data: {
            url: `https://storage.example.test/signed/${id}?token=abc`,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        },
  );
}

function renderPage(
  overrides: Partial<Parameters<typeof SongPage>[0]> = {},
): ReturnType<typeof signer> {
  const sign = signer();
  render(
    <SongPage
      song={full}
      canEdit={false}
      canViewHistory={false}
      getSignedResourceUrl={sign}
      {...overrides}
    />,
  );
  return (overrides.getSignedResourceUrl as ReturnType<typeof signer>) ?? sign;
}

describe('openPlan', () => {
  const base = { url: null, storagePath: null };
  it('signs stored files and never uses the storage path as a URL', () => {
    expect(openPlan({ ...base, format: 'pdf', storagePath: 'songs/a.pdf' })).toEqual({
      type: 'pdf',
      signed: true,
    });
    expect(openPlan({ ...base, format: 'mp3', storagePath: 'songs/a.mp3' })).toEqual({
      type: 'audio',
      signed: true,
    });
    expect(openPlan({ ...base, format: 'pro', storagePath: 'songs/a.pro' })).toEqual({
      type: 'download',
      signed: true,
    });
  });

  it('opens links in a new tab and hosted media directly', () => {
    expect(openPlan({ ...base, format: 'url', url: 'https://x.test' })).toEqual({
      type: 'link',
      url: 'https://x.test',
    });
    expect(openPlan({ ...base, format: 'mp3', url: 'https://x.test/a.mp3' })).toEqual({
      type: 'audio',
      signed: false,
      url: 'https://x.test/a.mp3',
    });
    expect(openPlan({ ...base, format: 'pdf', url: 'https://x.test/a.pdf' })).toEqual({
      type: 'link',
      url: 'https://x.test/a.pdf',
    });
  });

  it('does nothing for unavailable files', () => {
    expect(openPlan({ ...base, format: 'pdf' })).toEqual({ type: 'none' });
    expect(openPlan({ ...base, format: 'url' })).toEqual({ type: 'none' });
  });
});

describe('themesBySection', () => {
  it('groups in section order and sorts names', () => {
    const t = (id: string, name: string) => ({ id, name });
    expect(
      themesBySection([
        { section: 'bridge', theme: t('1', 'victory') },
        { section: 'chorus', theme: t('2', 'praise') },
        { section: 'chorus', theme: t('3', 'joy') },
      ]),
    ).toEqual([
      { section: 'chorus', themes: [t('3', 'joy'), t('2', 'praise')] },
      { section: 'bridge', themes: [t('1', 'victory')] },
    ]);
  });
});

describe('SongPage', () => {
  it('shows the header atoms, details and every panel', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: full.title })).toBeInTheDocument();
    expect(screen.getByText(`Also known as ${full.altTitles.join(', ')}`)).toBeInTheDocument();
    expect(screen.getByText(ENERGY_META[full.energyLevel!].label)).toBeInTheDocument();
    const atoms = screen.getByTestId('song-atoms');
    expect(within(atoms).getByRole('img', { name: /BPM/ })).toBeInTheDocument();
    for (const name of [
      'Lyrics',
      'Themes',
      'Files',
      'Keys and first chords',
      'Composers',
      'First lines',
      'Branch usage',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByRole('article', { name: 'Lyrics' })).toBeInTheDocument();
  });

  it('shows Edit and Add files only to editors', () => {
    renderPage();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add files' })).not.toBeInTheDocument();
    cleanup();
    renderPage({ canEdit: true });
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/songs/${full.id}/edit`,
    );
    expect(screen.getByRole('link', { name: 'Add files' })).toBeInTheDocument();
  });

  it('shows the History tab only when allowed, with the slot as its content', async () => {
    renderPage();
    expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument();
    cleanup();
    renderPage({ canViewHistory: true, historySlot: <p>History goes here</p> });
    const tab = screen.getByRole('tab', { name: 'History' });
    await userEvent.click(tab);
    expect(screen.getByText('History goes here')).toBeInTheDocument();
  });

  it('shows a placeholder in the History tab before LIB-19 fills it', async () => {
    renderPage({ canViewHistory: true });
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText('No change history to show yet.')).toBeInTheDocument();
  });

  it('opens a PDF in the viewer through a signed URL only', async () => {
    const sign = signer();
    renderPage({ getSignedResourceUrl: sign });
    const score = byLabel(full, 'Full score');
    await userEvent.click(screen.getByRole('button', { name: /^Full score, .*opens viewer/ }));

    const dialog = await screen.findByRole('dialog', { name: `${full.title} · Full score` });
    expect(sign).toHaveBeenCalledWith(score.id);
    const download = within(dialog).getByRole('link', { name: /download/i });
    expect(download.getAttribute('href')).toBe(
      `https://storage.example.test/signed/${score.id}?token=abc`,
    );
    for (const r of full.resources) {
      if (r.storagePath) expect(document.body.innerHTML).not.toContain(r.storagePath);
    }
  });

  it('reuses a signed URL that is still fresh', async () => {
    const sign = signer();
    renderPage({ getSignedResourceUrl: sign });
    const button = () => screen.getByRole('button', { name: /^Full score, .*opens viewer/ });
    await userEvent.click(button());
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(button());
    await screen.findByRole('dialog');
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it('plays audio inline and can close the player', async () => {
    const sign = signer();
    renderPage({ getSignedResourceUrl: sign });
    const mp3 = byLabel(full, 'MP3 D 1');
    await userEvent.click(screen.getByRole('button', { name: /^MP3 D 1, .*plays here/ }));
    const player = await screen.findByTestId('now-playing');
    expect(player.querySelector('audio')?.getAttribute('src')).toBe(
      `https://storage.example.test/signed/${mp3.id}?token=abc`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close player' }));
    expect(screen.queryByTestId('now-playing')).not.toBeInTheDocument();
  });

  it('downloads projection files through a signed URL', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const sign = signer();
    renderPage({ getSignedResourceUrl: sign });
    const pro = byLabel(full, 'ProPresenter');
    await userEvent.click(screen.getByRole('button', { name: /^ProPresenter, .*downloads/ }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.href).toBe(`https://storage.example.test/signed/${pro.id}?token=abc`);
    expect(anchor.hasAttribute('download')).toBe(true);
  });

  it('opens links in a new tab without signing', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const sign = signer();
    renderPage({ getSignedResourceUrl: sign });
    const link = byLabel(full, 'YouTube: Hillsong 7/5/22');
    await userEvent.click(
      screen.getByRole('button', { name: /^YouTube: Hillsong 7\/5\/22, .*new tab/ }),
    );
    expect(openSpy).toHaveBeenCalledWith(link.url, '_blank', 'noopener,noreferrer');
    expect(sign).not.toHaveBeenCalled();
  });

  it('reports a file that cannot be opened', async () => {
    const sign = signer(true);
    renderPage({ getSignedResourceUrl: sign });
    await userEvent.click(screen.getByRole('button', { name: /^Full score, .*opens viewer/ }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't open Full score", {
        description: 'File not found.',
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't open Full score.");
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('treats a rejected request like a failure', async () => {
    const sign = vi.fn(async (): Promise<SignedUrlResult> => {
      throw new Error('network');
    });
    renderPage({ getSignedResourceUrl: sign });
    await userEvent.click(screen.getByRole('button', { name: /^Full score, .*opens viewer/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves focus to the lyrics from the files panel', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Show lyrics' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Lyrics' }).closest('section'),
    ).toHaveFocus();
  });

  it('shows empty states for a song without files or themes', () => {
    renderPage({ song: empty });
    expect(screen.getByText('No files yet')).toBeInTheDocument();
    if (empty.themes.length === 0) {
      expect(screen.getByText('No themes tagged yet.')).toBeInTheDocument();
    }
  });

  it('shows "Not set" when the song has no energy level', () => {
    renderPage({ song: { ...full, energyLevel: null, energyNotes: null, sourceGroup: null } });
    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.queryByText('Energy notes')).not.toBeInTheDocument();
  });
});

describe('SongPageSkeleton and SongPageError', () => {
  it('renders the loading state', () => {
    render(<SongPageSkeleton />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading song…');
  });

  it('renders the error state with a retry link', () => {
    render(<SongPageError retryHref="/songs/abc" />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this song");
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/songs/abc');
  });
});
