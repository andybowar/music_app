import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { songs } from '@/fixtures';
import type { Resource } from '@/types/domain';
import { AudioPicker, audioOptionLabel, isYouTubeUrl, playableResources } from './AudioPicker';

afterEach(cleanup);

const song = songs.find((s) => s.id === '40000000-0000-4000-8000-000000000001')!;
const mp3 = song.resources.find((r) => r.kind === 'audio' && r.format === 'mp3')!;
const youTube = song.resources.find((r) => r.label === 'YouTube: Hillsong 7/5/22')!;
const instruction = song.resources.find((r) => r.kind === 'instruction_link')!;
const pdf = song.resources.find((r) => r.format === 'pdf')!;
const nova: Resource = { ...mp3, id: 'nova-0000', label: 'Nova recording 3/15/24' };
const resources = [pdf, nova, youTube, instruction];

function renderPicker(value: string | null = null, list: Resource[] = resources) {
  const onChange = vi.fn();
  render(<AudioPicker resources={list} value={value} onChange={onChange} />);
  return { onChange, select: screen.getByRole('combobox', { name: 'Recording' }) };
}

describe('helpers', () => {
  it('keeps only audio and video links', () => {
    expect(playableResources(resources).map((r) => r.id)).toEqual([nova.id, youTube.id]);
  });

  it('detects YouTube hosts', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=fake-id')).toBe(true);
    expect(isYouTubeUrl('https://youtu.be/fake-id')).toBe(true);
    expect(isYouTubeUrl('https://example.com/a.mp3')).toBe(false);
    expect(isYouTubeUrl('not a url')).toBe(false);
    expect(isYouTubeUrl(null)).toBe(false);
  });

  it('labels options', () => {
    expect(audioOptionLabel(nova)).toBe('Nova recording 3/15/24');
    expect(audioOptionLabel(youTube)).toBe('YouTube: Hillsong 7/5/22');
    expect(audioOptionLabel({ ...youTube, label: 'Hillsong 7/5/22' })).toBe(
      'YouTube: Hillsong 7/5/22',
    );
    expect(audioOptionLabel({ ...youTube, label: ' ' })).toBe('YouTube video');
    expect(
      audioOptionLabel({
        ...youTube,
        label: '',
        url: 'https://example.com/fake.mp3',
        kind: 'audio',
      }),
    ).toBe('Audio link');
    expect(audioOptionLabel({ ...mp3, label: '' })).toBe('MP3 recording');
  });
});

describe('AudioPicker', () => {
  it("lists the song's MP3 and YouTube audio, grouped, and nothing else", () => {
    const { select } = renderPicker();
    const recordings = within(screen.getByRole('group', { name: 'Recordings' }));
    const links = within(screen.getByRole('group', { name: 'Links' }));
    expect(recordings.getByRole('option', { name: 'Nova recording 3/15/24' })).toBeInTheDocument();
    expect(links.getByRole('option', { name: 'YouTube: Hillsong 7/5/22' })).toBeInTheDocument();
    expect(within(select).getAllByRole('option')).toHaveLength(3);
    expect(screen.queryByText(instruction.label)).not.toBeInTheDocument();
    expect(select).toBeEnabled();
  });

  it('shows the current selection', () => {
    const { select } = renderPicker(youTube.id);
    expect(select).toHaveValue(youTube.id);
    expect(screen.getByRole('option', { name: 'YouTube: Hillsong 7/5/22' })).toHaveProperty(
      'selected',
      true,
    );
  });

  it('shows no recording when the value is null or not playable', () => {
    expect(renderPicker(null).select).toHaveValue('');
    cleanup();
    expect(renderPicker(pdf.id).select).toHaveValue('');
  });

  it('chooses and clears a recording', async () => {
    const user = userEvent.setup();
    const { select, onChange } = renderPicker(nova.id);
    await user.selectOptions(select, youTube.id);
    expect(onChange).toHaveBeenLastCalledWith(youTube.id);
    await user.selectOptions(select, 'No recording');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('is disabled with a hint when the song has no audio', () => {
    const { select } = renderPicker(null, [pdf, instruction]);
    expect(select).toBeDisabled();
    expect(select).toHaveAccessibleDescription(/no audio yet/i);
    expect(within(select).getAllByRole('option')).toHaveLength(1);
  });

  it('has no hint when audio exists', () => {
    const { select } = renderPicker();
    expect(select).not.toHaveAccessibleDescription();
  });

  it('is a native select reachable by keyboard', async () => {
    const user = userEvent.setup();
    const { select } = renderPicker(null);
    await user.tab();
    expect(select).toHaveFocus();
    // Native <select>: arrow keys / type-ahead / Enter are handled by the browser and OS picker.
    expect(select.tagName).toBe('SELECT');
  });

  it('is skipped by Tab when disabled', async () => {
    const user = userEvent.setup();
    const { select } = renderPicker(null, [pdf]);
    await user.tab();
    expect(select).not.toHaveFocus();
  });

  it('accepts a custom accessible name and fills its container (360px safe)', () => {
    render(
      <AudioPicker resources={resources} value={null} onChange={() => {}} label="Audio for Song" />,
    );
    const select = screen.getByRole('combobox', { name: 'Audio for Song' });
    expect(select).toHaveClass('w-full', 'min-w-0', 'truncate');
  });
});
