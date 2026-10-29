/**
 * Paste-and-split lyrics parser (REQ-LIB-14). Pure: no I/O, safe on client and server.
 *
 * Splits pasted lyrics on section headings into the 7 section fields and builds the
 * arrangement (order as sung, repeats allowed). Nothing pasted is silently lost: anything
 * folded, merged or dropped is reported in `warnings`.
 */
import { SECTION_LABEL, SECTIONS, type Section, type SongLyrics } from '@/types/domain';

/** Same limits as `songInputSchema` in `@/types/validation`. */
const MAX_ARRANGEMENT = 30;
const MAX_SECTION_CHARS = 5000;
/** Largest "x N" repeat honoured on a single heading. */
const MAX_REPEAT = 10;
const MAX_VERSES = 5;

export interface ParsedLyrics {
  lyrics: Partial<SongLyrics>;
  arrangement: Section[];
  warnings: string[];
}

type Heading =
  | { kind: 'section'; section: Section; label: string; repeat: number; verseNumber?: number }
  | { kind: 'verse'; label: string; repeat: number }
  | { kind: 'fold'; label: string; key: string; repeat: number };

// ---------- Heading recognition ----------

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

/** "1", "01", "1st", "one", "first", "iv" → number; anything else → null. */
function parseNumber(token: string): number | null {
  const digits = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(token);
  if (digits) {
    const n = Number(digits[1]);
    return n > 0 ? n : null;
  }
  return NUMBER_WORDS[token] ?? null;
}

/** Strips markdown/bracket decoration and trailing punctuation around a heading label. */
function cleanLabel(raw: string): string {
  let s = raw.trim();
  let prev: string;
  do {
    prev = s;
    s = s
      .replace(/^#+\s*/, '')
      .replace(/^(\*\*|__)(.+)\1$/, '$2')
      .replace(/^[[({<]([^[\](){}<>]*)[\])}>]$/, '$1')
      .replace(/\s*[:.\-–—]+$/, '')
      .trim();
  } while (s !== prev);
  return s;
}

const REPEAT_SUFFIX =
  /\s*[([]?\s*(?:[x×]\s*(\d{1,2})|(\d{1,2})\s*(?:[x×]|times)|(repeat|rpt))\s*[)\]]?$/;
const REPEAT_PREFIX = /^(?:repeat|rpt)(?:\s+the)?\s+/;

const FOLD_NAMES: Array<[RegExp, string]> = [
  [/^(?:pre[\s-]?chorus|pre|pc|lift|channel|build)$/, 'Pre-chorus'],
  [/^post[\s-]?chorus$/, 'Post-chorus'],
  [/^tag$/, 'Tag'],
  [/^(?:ending|outro|coda)$/, 'Ending'],
  [/^intro$/, 'Intro'],
  [/^(?:interlude|instrumental|turnaround|vamp)$/, 'Interlude'],
];

/**
 * Recognises a whole line as a section heading. Returns null for ordinary lyric lines.
 * Accepts e.g. "Chorus", "CHORUS:", "[Chorus]", "## Chorus", "**Chorus**", "Chorus x2",
 * "Chorus (2x)", "Repeat chorus", "Verse 1", "V1", "Verse One", "First verse", "Refrain",
 * "Bridge 2", "Pre-Chorus", "Tag".
 */
function parseHeading(line: string): Heading | null {
  const label = cleanLabel(line);
  let s = label.toLowerCase();
  if (!s || s.length > 40) return null;

  let repeat = 1;
  const suffix = REPEAT_SUFFIX.exec(s);
  if (suffix) {
    const n = Number(suffix[1] ?? suffix[2] ?? 1);
    repeat = Math.min(Math.max(n, 1), MAX_REPEAT);
    s = cleanLabel(s.slice(0, suffix.index)).toLowerCase();
  }
  s = s.replace(REPEAT_PREFIX, '');

  const chorus = /^(?:(?:final|last)\s+)?(?:chorus|refrain|chor|cho|ch)(?:\s*(\S+))?$/.exec(s);
  if (chorus && (chorus[1] === undefined || parseNumber(chorus[1]) !== null)) {
    return { kind: 'section', section: 'chorus', label, repeat };
  }

  const bridge = /^(?:(?:final|last)\s+)?(?:bridge|br)(?:\s*(\S+))?$/.exec(s);
  if (bridge && (bridge[1] === undefined || parseNumber(bridge[1]) !== null)) {
    return { kind: 'section', section: 'bridge', label, repeat };
  }

  const verse =
    /^(?:verse|vs|stanza)(?:\s*(\S+))?$/.exec(s) ??
    /^v\.?\s*(\S+)$/.exec(s) ??
    /^(\S+)\s+(?:verse|stanza)$/.exec(s);
  if (verse) {
    if (verse[1] === undefined) return { kind: 'verse', label, repeat };
    const n = parseNumber(verse[1]);
    if (n !== null) {
      const section = `verse_${Math.min(n, MAX_VERSES)}` as Section;
      return { kind: 'section', section, label, repeat, verseNumber: n };
    }
  }

  const name = s.replace(/\s*\d{1,2}$/, '');
  for (const [pattern, key] of FOLD_NAMES) {
    if (pattern.test(name)) return { kind: 'fold', label, key, repeat };
  }
  return null;
}

/** A heading line, optionally followed on the same line by its first lyric line. */
function detectHeading(line: string): { heading: Heading; inline: string } | null {
  const whole = parseHeading(line);
  if (whole) return { heading: whole, inline: '' };
  const split =
    /^\s*(\[[^\]]+\]|\([^)]+\))\s*:?\s*(\S.*)$/.exec(line) ?? /^([^:]{1,40}):\s*(\S.*)$/.exec(line);
  if (!split) return null;
  const heading = parseHeading(split[1]!);
  return heading ? { heading, inline: split[2]!.trim() } : null;
}

// ---------- Text helpers ----------

const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);
const LINE_BREAKS = new RegExp(`\\r\\n?|[${String.fromCharCode(0x2028, 0x2029)}]`, 'g');
const SPACES = new RegExp(`[\\t${String.fromCharCode(0xa0)}]`, 'g');

function normalizeText(text: string): string {
  return text.replace(BOM, '').replace(LINE_BREAKS, '\n').replace(SPACES, ' ');
}

/** Trims lines, drops leading/trailing blank lines and collapses runs of blank lines to one. */
function cleanBody(lines: string[]): string {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line || (out.length > 0 && out[out.length - 1] !== '')) out.push(line);
  }
  while (out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

function comparable(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** First non-blank line of a section, trimmed; null when there is none. */
export function firstLine(text: string | null): string | null {
  if (text == null) return null;
  for (const line of text.split(/\r\n?|\n/)) {
    const t = line.trim();
    if (t) return t;
  }
  return null;
}

// ---------- Parser ----------

/**
 * Splits pasted lyrics into the 7 section fields + arrangement.
 *
 * - Headings are whole lines (case-insensitive; brackets, '#', '**' and trailing ':' allowed).
 * - "Chorus x2" / "Repeat chorus" / a heading with no lyrics under it → repeat in the arrangement.
 * - A repeated heading with the same text adds to the arrangement without duplicating text;
 *   with different text (e.g. "Bridge 2"), the new text is appended to that field (warned).
 * - Text before the first heading → verse_1. Unnumbered "Verse" → next verse number.
 * - Verses beyond 5 fold into verse_5; Pre-chorus, Tag, Intro, Ending etc. fold into the
 *   previous section (SPEC §6 default: no extra columns).
 */
export function parseLyrics(text: string): ParsedLyrics {
  const blocks: Array<{ heading: Heading | null; lines: string[] }> = [
    { heading: null, lines: [] },
  ];
  for (const line of normalizeText(text).split('\n')) {
    const found = detectHeading(line);
    if (found) blocks.push({ heading: found.heading, lines: found.inline ? [found.inline] : [] });
    else blocks[blocks.length - 1]!.lines.push(line);
  }

  const lyrics: Partial<Record<Section, string>> = {};
  const arrangement: Section[] = [];
  const warnings: string[] = [];
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message);
  };
  const foldMemory = new Map<string, string>();
  let current: Section | null = null;
  let currentFresh = false;
  let lastVerse: Section | null = null;
  let maxVerse = 0;

  const push = (section: Section, times: number) => {
    for (let i = 0; i < times; i++) arrangement.push(section);
  };

  /** Records a section occurrence. Returns true when its text was merged into existing text. */
  const addSection = (section: Section, body: string, repeat: number): boolean => {
    const existing = lyrics[section];
    let merged = false;
    if (!body || (existing && comparable(existing) === comparable(body))) {
      push(section, repeat);
      currentFresh = false;
    } else if (!existing) {
      lyrics[section] = body;
      push(section, repeat);
      currentFresh = true;
    } else {
      lyrics[section] = `${existing}\n\n${body}`;
      push(section, arrangement[arrangement.length - 1] === section ? repeat - 1 : repeat);
      currentFresh = true;
      merged = true;
    }
    current = section;
    if (section.startsWith('verse_')) lastVerse = section;
    return merged;
  };

  const appendTo = (section: Section, body: string) => {
    const existing = lyrics[section];
    lyrics[section] = existing ? `${existing}\n\n${body}` : body;
    if (!arrangement.includes(section)) arrangement.push(section);
  };

  const hasHeadings = blocks.length > 1;
  for (const { heading, lines } of blocks) {
    const body = cleanBody(lines);

    if (heading === null) {
      if (!body) continue;
      warn(
        hasHeadings
          ? 'Text before the first heading was put in Verse 1.'
          : 'No section headings found, so all lyrics were put in Verse 1. Add headings like "Verse 1" and "Chorus" to split them.',
      );
      addSection('verse_1', body, 1);
      maxVerse = Math.max(maxVerse, 1);
      continue;
    }

    if (heading.kind === 'fold') {
      const target: Section = current ?? 'verse_1';
      const where = SECTION_LABEL[target];
      if (body) {
        foldMemory.set(heading.key, body);
        if (!lyrics[target]?.endsWith(body)) {
          appendTo(target, body);
          warn(
            `"${heading.label}" has no field of its own, so its lyrics were added to the end of ${where}.`,
          );
        }
        if (heading.repeat > 1) {
          warn(`The repeat on "${heading.label}" was ignored because it was folded into ${where}.`);
        }
        if (current === null) {
          maxVerse = Math.max(maxVerse, 1);
          current = target;
          currentFresh = true;
        }
      } else {
        const remembered = foldMemory.get(heading.key);
        if (remembered && lyrics[target]?.endsWith(remembered)) continue;
        if (remembered && current !== null && currentFresh) {
          appendTo(target, remembered);
          warn(
            `"${heading.label}" has no field of its own, so its lyrics were added to the end of ${where}.`,
          );
        } else {
          warn(`Ignored the "${heading.label}" heading because it has no lyrics under it.`);
        }
      }
      continue;
    }

    if (heading.kind === 'verse') {
      const sameAsVerse = SECTIONS.find(
        (s) => s.startsWith('verse_') && lyrics[s] && comparable(lyrics[s]) === comparable(body),
      );
      if (sameAsVerse) {
        addSection(sameAsVerse, body, heading.repeat);
        continue;
      }
      if (!body && lastVerse) {
        addSection(lastVerse, '', heading.repeat);
        continue;
      }
      // Next verse number. Its slot is always empty: a filled verse_N implies maxVerse >= N.
      maxVerse += 1;
      if (maxVerse > MAX_VERSES)
        warn(`Only ${MAX_VERSES} verses are supported; verse ${maxVerse} was added to Verse 5.`);
      addSection(`verse_${Math.min(maxVerse, MAX_VERSES)}` as Section, body, heading.repeat);
      continue;
    }

    const { section, verseNumber } = heading;
    if (verseNumber !== undefined) maxVerse = Math.max(maxVerse, verseNumber);
    if (verseNumber !== undefined && verseNumber > MAX_VERSES) {
      warn(`Only ${MAX_VERSES} verses are supported; "${heading.label}" was added to Verse 5.`);
      addSection(section, body, heading.repeat);
    } else if (addSection(section, body, heading.repeat)) {
      warn(mergeWarning(heading.label, section));
    }
  }

  // Arrangement entries must have lyrics (songInputSchema rule).
  const result: Section[] = [];
  for (const s of arrangement) {
    if (lyrics[s]?.trim()) result.push(s);
    else warn(`"${SECTION_LABEL[s]}" was left out of the order because it has no lyrics.`);
  }
  if (result.length > MAX_ARRANGEMENT) {
    warn(`The order was cut to the first ${MAX_ARRANGEMENT} sections.`);
    result.length = MAX_ARRANGEMENT;
  }

  const out: Partial<SongLyrics> = {};
  for (const s of SECTIONS) {
    const value = lyrics[s];
    if (!value) continue;
    out[s] = value;
    if (value.length > MAX_SECTION_CHARS) {
      warn(
        `${SECTION_LABEL[s]} is longer than ${MAX_SECTION_CHARS} characters and must be shortened.`,
      );
    }
  }
  return { lyrics: out, arrangement: result, warnings };
}

function mergeWarning(label: string, section: Section): string {
  const name = SECTION_LABEL[section];
  return `"${label}" has different lyrics from the earlier ${name}, so they were added to the end of ${name}.`;
}
