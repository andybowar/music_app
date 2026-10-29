import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineAudio } from './InlineAudio';

// jsdom has no media playback: fake play/pause/paused/duration on the prototype.
const paused = new WeakMap<HTMLMediaElement, boolean>();
const durations = new WeakMap<HTMLMediaElement, number>();
let playImpl: (el: HTMLMediaElement) => Promise<void>;

beforeEach(() => {
  playImpl = async (el) => {
    paused.set(el, false);
    el.dispatchEvent(new Event('play'));
  };
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return playImpl(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    paused.set(this, true);
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return paused.get(this) ?? true;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return durations.get(this) ?? Number.NaN;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function audioEl(container: HTMLElement) {
  return container.querySelector('audio')!;
}

function loadMetadata(el: HTMLAudioElement, seconds: number) {
  durations.set(el, seconds);
  fireEvent.loadedMetadata(el);
}

describe('InlineAudio', () => {
  it('starts in a loading state with seeking disabled', () => {
    const { container } = render(<InlineAudio url="/a.mp3" title="Song A" />);
    expect(screen.getByRole('slider', { name: 'Seek Song A' })).toBeDisabled();
    expect(screen.getByText('0:00 / --:--')).toBeInTheDocument();
    expect(audioEl(container)).toHaveAttribute('preload', 'metadata');
  });

  it('shows the duration once metadata loads', () => {
    const { container } = render(<InlineAudio url="/a.mp3" title="Song A" />);
    loadMetadata(audioEl(container), 125);
    expect(screen.getByRole('slider', { name: 'Seek Song A' })).toBeEnabled();
    expect(screen.getByText('0:00 / 2:05')).toBeInTheDocument();
  });

  it('plays and pauses from the button and the keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(<InlineAudio url="/a.mp3" title="Song A" />);
    loadMetadata(audioEl(container), 60);

    await user.click(screen.getByRole('button', { name: 'Play Song A' }));
    const pause = screen.getByRole('button', { name: 'Pause Song A' });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();

    pause.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Play Song A' })).toBeInTheDocument();
  });

  it('seeks with the slider and the arrow keys', async () => {
    const user = userEvent.setup();
    const { container } = render(<InlineAudio url="/a.mp3" title="Song A" />);
    const el = audioEl(container);
    loadMetadata(el, 60);
    const slider = screen.getByRole('slider', { name: 'Seek Song A' });

    fireEvent.change(slider, { target: { value: '30' } });
    expect(el.currentTime).toBe(30);
    expect(screen.getByText('0:30 / 1:00')).toBeInTheDocument();

    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(el.currentTime).toBe(35);
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(el.currentTime).toBe(25);
    expect(slider).toHaveAttribute('aria-valuetext', '0:25 of 1:00');
  });

  it('tracks playback time and resets the button when playback ends', async () => {
    const user = userEvent.setup();
    const { container } = render(<InlineAudio url="/a.mp3" title="Song A" />);
    const el = audioEl(container);
    loadMetadata(el, 60);
    await user.click(screen.getByRole('button', { name: 'Play Song A' }));
    el.currentTime = 12;
    fireEvent.timeUpdate(el);
    expect(screen.getByText('0:12 / 1:00')).toBeInTheDocument();
    act(() => {
      paused.set(el, true);
      el.dispatchEvent(new Event('ended'));
    });
    expect(screen.getByRole('button', { name: 'Play Song A' })).toBeInTheDocument();
  });

  it('pauses other inline players when one starts', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <InlineAudio url="/a.mp3" title="Song A" />
        <InlineAudio url="/b.mp3" title="Song B" />
      </>,
    );
    const [a, b] = container.querySelectorAll('audio');
    loadMetadata(a!, 60);
    loadMetadata(b!, 60);
    await user.click(screen.getByRole('button', { name: 'Play Song A' }));
    await user.click(screen.getByRole('button', { name: 'Play Song B' }));
    expect(screen.getByRole('button', { name: 'Play Song A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause Song B' })).toBeInTheDocument();
  });

  it('shows an error with a download link when the file fails to load', () => {
    const { container } = render(<InlineAudio url="/files/a.mp3" title="Song A" />);
    fireEvent.error(audioEl(container));
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t play this audio.');
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'a.mp3');
  });

  it('shows an error when play() is rejected, but not for an aborted play', async () => {
    const user = userEvent.setup();
    const { container } = render(<InlineAudio url="/a.mp3" title="Song A" />);
    loadMetadata(audioEl(container), 60);

    playImpl = () => Promise.reject(new DOMException('raced', 'AbortError'));
    await user.click(screen.getByRole('button', { name: 'Play Song A' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    playImpl = () => Promise.reject(new DOMException('nope', 'NotSupportedError'));
    await user.click(screen.getByRole('button', { name: 'Play Song A' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('picks up an error that happened before hydration', () => {
    // jsdom has no `HTMLMediaElement.error`; define it for this test only.
    Object.defineProperty(HTMLMediaElement.prototype, 'error', {
      configurable: true,
      get: () => ({ code: 4 }) as MediaError,
    });
    try {
      render(<InlineAudio url="/a.mp3" title="Song A" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    } finally {
      delete (HTMLMediaElement.prototype as { error?: unknown }).error;
    }
  });

  it('picks up metadata that loaded before hydration', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      HTMLMediaElement.HAVE_METADATA,
    );
    vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(90);
    render(<InlineAudio url="/a.mp3" title="Song A" />);
    expect(screen.getByText('0:00 / 1:30')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Seek Song A' })).toBeEnabled();
  });

  it('renders an empty state without a URL', () => {
    const { container } = render(<InlineAudio url="" title="Song A" />);
    expect(screen.getByText('No audio for Song A.')).toBeInTheDocument();
    expect(container.querySelector('audio')).toBeNull();
  });
});
