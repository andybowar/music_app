import { capoShape, prettyChord } from '@/lib/lyrics/capo';

/**
 * A chord under a capo: the shape to play, with the chord that sounds small beside it,
 * e.g. "G (A♭)". Without a capo (or for marks like N.C.), just the chord.
 */
export function CapoChord({
  chord,
  capo,
  soundingKey,
}: {
  chord: string;
  capo: number;
  soundingKey: string | null;
}) {
  const shape = capoShape(chord, capo, soundingKey);
  if (capo === 0 || shape === chord) return <>{prettyChord(chord)}</>;
  return (
    <>
      {prettyChord(shape)}
      <span className="ms-0.5 text-[0.75em] font-normal opacity-70">({prettyChord(chord)})</span>
    </>
  );
}
