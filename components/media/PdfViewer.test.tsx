import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PdfDocumentProps } from './PdfDocument';
import { PdfViewer } from './PdfViewer';

// pdf.js can't run in jsdom: replace the react-pdf part with a fake that "loads" 3 pages,
// or fails for URLs containing "broken".
vi.mock('./PdfDocument', () => ({
  PdfDocument: ({ url, pageNumber, width, onLoadSuccess, onLoadError }: PdfDocumentProps) => {
    useEffect(() => {
      if (url.includes('broken')) onLoadError(new Error('404'));
      else onLoadSuccess(3);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per mount, like react-pdf
    }, [url]);
    return <div data-testid="pdf-page" data-page={pageNumber} data-width={width} />;
  },
}));

beforeAll(() => {
  // The viewer fits pages to the scroll area's width; jsdom reports 0 for every element.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(432);
});

afterEach(cleanup);

const URL_OK = '/dev/sample.pdf';

async function renderReady(onClose = vi.fn()) {
  render(<PdfViewer url={URL_OK} title="Song A · Full score" onClose={onClose} />);
  await screen.findByText('Page 1 of 3');
  return onClose;
}

describe('PdfViewer', () => {
  it('opens as a dialog named after the file, with a loading state first', async () => {
    render(<PdfViewer url={URL_OK} title="Song A · Full score" onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Song A · Full score' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await screen.findByText('Page 1 of 3');
    expect(screen.queryByRole('status', { name: 'Loading PDF' })).not.toBeInTheDocument();
  });

  it('fits the page to the available width (minus gutters)', async () => {
    await renderReady();
    expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-width', '400');
  });

  it('navigates pages with buttons and stops at the ends', async () => {
    const user = userEvent.setup();
    await renderReady();
    const prev = screen.getByRole('button', { name: 'Previous page' });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(prev).toBeDisabled();
    await user.click(next);
    await user.click(next);
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page', '3');
    expect(next).toBeDisabled();
    await user.click(prev);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('supports keyboard page navigation and zoom', async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    await user.keyboard('{End}');
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    await user.keyboard('{Home}');
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    await user.keyboard('{PageDown}{PageUp}');
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    await user.keyboard('+');
    expect(screen.getByRole('button', { name: /^Zoom 125%/ })).toBeInTheDocument();
    expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-width', '500');
    await user.keyboard('--');
    expect(screen.getByRole('button', { name: /^Zoom 75%/ })).toBeInTheDocument();
    await user.keyboard('0');
    expect(screen.getByRole('button', { name: /^Zoom 100%/ })).toBeInTheDocument();
  });

  it('zooms with the buttons and resets from the percentage', async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: /^Zoom 150%/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Zoom 150%/ }));
    expect(screen.getByRole('button', { name: /^Zoom 100%/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });

  it('zooms on ctrl+wheel (trackpad pinch) but ignores plain scrolling', async () => {
    await renderReady();
    const scroller = screen.getByTestId('pdf-scroll');
    fireEvent.wheel(scroller, { deltaY: 100 });
    expect(screen.getByRole('button', { name: /^Zoom 100%/ })).toBeInTheDocument();
    fireEvent.wheel(scroller, { deltaY: -50, ctrlKey: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Zoom 165%/ })).toBeInTheDocument(),
    );
  });

  it('zooms with a two-finger pinch', async () => {
    await renderReady();
    const scroller = screen.getByTestId('pdf-scroll');
    const touch = (type: string, pointerId: number, x: number) =>
      fireEvent[type as 'pointerDown'](scroller, {
        pointerId,
        pointerType: 'touch',
        clientX: x,
        clientY: 0,
      });
    touch('pointerDown', 1, 100);
    touch('pointerDown', 2, 200);
    touch('pointerMove', 2, 300);
    // Live gesture: CSS transform only, no re-render of the page yet.
    expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-width', '400');
    touch('pointerUp', 2, 300);
    touch('pointerUp', 1, 100);
    expect(screen.getByRole('button', { name: /^Zoom 200%/ })).toBeInTheDocument();
    expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-width', '800');
  });

  it('offers a download link named after the file', async () => {
    await renderReady();
    const link = screen.getByRole('link', { name: 'Download Song A · Full score' });
    expect(link).toHaveAttribute('href', URL_OK);
    expect(link).toHaveAttribute('download', 'sample.pdf');
  });

  it('calls onClose from the close button and from Escape', async () => {
    const user = userEvent.setup();
    const onClose = await renderReady();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('returns focus to the opener when it closes', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open score
          </button>
          {open && <PdfViewer url={URL_OK} title="Score" onClose={() => setOpen(false)} />}
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open score' });
    await user.click(opener);
    await screen.findByText('Page 1 of 3');
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('shows an error with retry and download when the PDF fails to load', async () => {
    const user = userEvent.setup();
    render(<PdfViewer url="/files/broken.pdf" title="Song A" onClose={() => {}} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t open this PDF.');
    expect(screen.getByRole('link', { name: 'Download instead' })).toHaveAttribute(
      'download',
      'broken.pdf',
    );
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows an empty state without a URL', () => {
    render(<PdfViewer url="" title="Song A" onClose={() => {}} />);
    expect(screen.getByText('No PDF to show.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pdf-page')).not.toBeInTheDocument();
  });
});
