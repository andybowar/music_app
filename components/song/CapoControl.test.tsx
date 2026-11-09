import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CapoChord } from './CapoChord';
import { CapoControl } from './CapoControl';
import { ChordLyrics } from './ChordLyrics';

afterEach(cleanup);

function Harness({ suggestion = 1 as number | null, onChange = vi.fn() }) {
  const [capo, setCapo] = useState(0);
  return (
    <CapoControl
      capo={capo}
      onChange={(n) => {
        onChange(n);
        setCapo(n);
      }}
      soundingKey="Ab"
      suggestion={suggestion}
    />
  );
}

describe('CapoControl', () => {
  it('steps from no capo up to 7 and says which shapes to play; the key stays', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText('No capo · key A♭')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Capo down a fret' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Capo up a fret' }));
    expect(screen.getByText('Capo 1 · play G shapes · key A♭')).toBeInTheDocument();
    for (let i = 0; i < 8; i++) {
      const up = screen.getByRole('button', { name: 'Capo up a fret' });
      if (!up.hasAttribute('disabled')) await user.click(up);
    }
    expect(
      screen.getByText(
        /^Capo 7 · play C♯ shapes|^Capo 7 · play Db shapes|^Capo 7 · play D♭ shapes/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Capo up a fret' })).toBeDisabled();
  });

  it('Suggest picks the friendliest fret and says why, or that none is needed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { unmount } = render(<Harness suggestion={1} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(onChange).toHaveBeenCalledWith(1);
    expect(screen.getByText(/Suggested: Capo 1, the fewest sharps and flats/)).toBeInTheDocument();
    unmount();
    render(<Harness suggestion={0} />);
    await user.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(screen.getByText(/already easiest without a capo/)).toBeInTheDocument();
  });

  it('Suggest is off when there is nothing to judge', () => {
    render(<Harness suggestion={null} />);
    expect(screen.getByRole('button', { name: 'Suggest' })).toBeDisabled();
  });
});

describe('CapoChord and ChordLyrics with a capo', () => {
  it('shows the shape with the sounding chord small beside it', () => {
    const { container } = render(<CapoChord chord="Ab" capo={1} soundingKey="Ab" />);
    expect(container).toHaveTextContent('G(A♭)');
    cleanup();
    const plain = render(<CapoChord chord="N.C." capo={1} soundingKey="Ab" />);
    expect(plain.container).toHaveTextContent('N.C.');
  });

  it('ChordLyrics uses the chord label for every chord', () => {
    const { container } = render(
      <ChordLyrics
        text={'[Ab]Amazing [Db]grace\n[Eb] [Ab]'}
        chordLabel={(c) => <CapoChord chord={c} capo={1} soundingKey="Ab" />}
      />,
    );
    expect(container).toHaveTextContent('G(A♭)');
    expect(container).toHaveTextContent('C(D♭)');
    expect(container.querySelector('[data-chord-line]')).toHaveTextContent('D(E♭)G(A♭)');
  });
});
