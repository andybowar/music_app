import {
  CHORD_RE,
  ENERGY_LEVELS,
  ENERGY_META,
  KEYED_KINDS,
  KIND_FORMATS,
  MAJOR_KEYS,
  MUSICAL_KEY_RE,
  RESOURCE_FORMATS,
  RESOURCE_KINDS,
  SECTION_LABEL,
  SECTIONS,
  TIME_SIGNATURE_RE,
} from './domain';

describe('domain constants', () => {
  it('has energy metadata for every level', () => {
    expect(Object.keys(ENERGY_META)).toEqual([...ENERGY_LEVELS]);
  });

  it('labels every section', () => {
    expect(Object.keys(SECTION_LABEL)).toEqual([...SECTIONS]);
  });

  it('keys every kind except projection', () => {
    expect(KEYED_KINDS).toEqual(RESOURCE_KINDS.filter((k) => k !== 'projection'));
  });

  it('maps every kind to known formats', () => {
    for (const kind of RESOURCE_KINDS) {
      expect(KIND_FORMATS[kind].length).toBeGreaterThan(0);
      for (const f of KIND_FORMATS[kind]) expect(RESOURCE_FORMATS).toContain(f);
    }
  });

  it('has major keys that match the key pattern', () => {
    for (const k of MAJOR_KEYS) expect(k).toMatch(MUSICAL_KEY_RE);
    expect('F#m').toMatch(MUSICAL_KEY_RE);
    expect('Cb#').not.toMatch(MUSICAL_KEY_RE);
  });

  it('matches chord and time signature patterns', () => {
    for (const c of ['G', 'Bm7', 'D/F#', 'Csus4', 'F#m7b5', 'C°', 'Gadd9']) {
      expect(c).toMatch(CHORD_RE);
    }
    for (const c of ['X', 'g', 'D/H', '']) expect(c).not.toMatch(CHORD_RE);
    expect('6/8').toMatch(TIME_SIGNATURE_RE);
    expect('4-4').not.toMatch(TIME_SIGNATURE_RE);
  });
});
