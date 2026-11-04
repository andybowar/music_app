'use client';

import { useState } from 'react';

import { AudioPicker, audioOptionLabel } from '@/features/player/ui/AudioPicker';
import { SONG_IDS, getSong, songs } from '@/fixtures';
import type { SongDetail, UUID } from '@/types/domain';

const withAudio = getSong(SONG_IDS.thousandHallelujahs);
const youTube = withAudio.resources.find((r) => r.label === 'YouTube: Hillsong 7/5/22');
const noAudio =
  songs.find((s) => !s.resources.some((r) => r.kind === 'audio' || r.kind === 'video_link')) ??
  songs[songs.length - 1]!;

interface Case {
  id: string;
  title: string;
  song: SongDetail;
  initial: UUID | null;
}

const CASES: Case[] = [
  {
    id: 'none',
    title: 'MP3 and YouTube audio, no selection',
    song: withAudio,
    initial: null,
  },
  {
    id: 'selected',
    title: 'Same song, a YouTube recording selected',
    song: withAudio,
    initial: youTube?.id ?? null,
  },
  {
    id: 'empty',
    title: 'Song with no audio (disabled, with a hint)',
    song: noAudio,
    initial: null,
  },
];

/**
 * Body of `/dev/audio-picker`: PLAY-06's AudioPicker, controlled, in a 360px-wide column fed by
 * fixture songs. Each picker shows the last value its `onChange` emitted.
 */
export function AudioPickerGallery() {
  return (
    <main className="mx-auto flex w-full max-w-[360px] flex-col gap-6 px-3 py-6">
      <h1 className="text-lg font-semibold">AudioPicker</h1>
      <p className="text-sm text-muted-foreground">
        PLAY-06 · picks the recording a playlist entry plays. Fixture songs only.
      </p>
      {CASES.map((c) => (
        <PickerCase key={c.id} {...c} />
      ))}
    </main>
  );
}

function PickerCase({ id, title, song, initial }: Case) {
  const [value, setValue] = useState<UUID | null>(initial);
  const [emitted, setEmitted] = useState<string>('none yet');
  const chosen = song.resources.find((r) => r.id === value);

  return (
    <section aria-labelledby={`case-${id}`} className="flex flex-col gap-2 rounded-md border p-3">
      <h2 id={`case-${id}`} className="text-sm font-medium">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{song.title}</p>
      <AudioPicker
        resources={song.resources}
        value={value}
        label={`Recording for ${song.title}`}
        onChange={(next) => {
          setValue(next);
          const picked = song.resources.find((r) => r.id === next);
          setEmitted(picked ? audioOptionLabel(picked) : 'null (cleared)');
        }}
      />
      <p className="text-xs text-muted-foreground" data-testid={`emitted-${id}`}>
        Selected: {chosen ? audioOptionLabel(chosen) : 'none'} · last onChange: {emitted}
      </p>
    </section>
  );
}
