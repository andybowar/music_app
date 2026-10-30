# Tagging guide for contributors

Tag every song the same way so anyone can find it by feel, key or theme. When unsure, pick
the closest option and explain in **Energy notes**. A music leader can fix it later.

## 1. Energy level

Pick the one level that fits **most of the song** in a typical service. Feel decides, not
just tempo: a slow song can still be big.

| Level                 | Color  | Sounds like                                   | Examples                                     |
| --------------------- | ------ | --------------------------------------------- | -------------------------------------------- |
| High Energy 'Praise'  | red    | Fast, loud, celebratory. Clapping, dancing.   | Cause to Celebrate; The Lord Almighty Reigns |
| High Energy 'Worship' | yellow | Big and full, often slower. Full band.        | 10000 Reasons; Agnus Dei                     |
| Mid Energy 'Worship'  | green  | Steady and singable. Builds and settles.      | A Thousand Hallelujahs; Revive This Land     |
| Deep 'Worship'        | purple | Slow, reverent. Lighter band, room to linger. | Lord You Are Worthy; At the Cross            |
| Quiet 'Worship'       | blue   | Very soft, intimate. Often one instrument.    | Be the Center                                |

- **Between two levels?** Choose the one the song spends more time in.
- **Song changes a lot?** Describe the shape in **Energy notes**, for example "starts
  light, slow build, big bridge build".
- **Tempo (BPM)** and **time signature** (`4/4`, `3/4`, `6/8`): copy from the chart or
  recording. Leave blank rather than guess.

## 2. Keys and first chords

Each song has **one primary key** (the key we usually sing) and any number of **alternate
keys** (keys we have charts or recordings for).

- Write keys as a capital letter, then `#` or `b`, then `m` for minor: `D`, `Eb`, `F#`,
  `Bbm`. Use the chart's spelling.
- Use the key that **sounds**, not capo shapes. "G, capo 2" is `A`.

For **each key**, enter four first chords:

| Field  | What to enter                                      |
| ------ | -------------------------------------------------- |
| Intro  | The first chord played before anyone sings.        |
| Verse  | The chord under the first sung word of verse 1.    |
| Chorus | The chord under the first sung word of the chorus. |
| Bridge | The chord under the first sung word of the bridge. |

- A pickup note before the bar line: use the first chord **on or after** it.
- Write chords as the chart shows them: `G`, `Bm7`, `Dsus`, `D/F#`. Search matches chords
  exactly, so don't add or drop extensions.
- **Leave blank** if the song has no such part or you don't know. The app shows **X** so
  others know it's missing. Never type "X" or "none".
- Example, A Thousand Hallelujahs in `D`: intro `D`, verse `D`, chorus `G`, bridge `D`.

## 3. Lyrics and sections

Sections are Chorus, Verse 1 to Verse 5 and Bridge. The **arrangement** is the order they
are sung, repeats included (Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus).

- **Pre-chorus, tag, ending or second bridge:** fold into the section just before it.
- Paste the lyrics with headings ("Verse 1", "Chorus") into **Paste full lyrics** to split
  them automatically, then check the result.

## 4. Themes

Themes are tagged **per section**, so a leader searching "the cross" lands on the right
verse.

1. **Search before you create.** Start typing and pick from the list. There are about 160
   themes with synonyms built in (typing "calvary" finds **the cross**).
2. **Tag what the words say** in that section, not the song's overall topic. A theme may
   appear on several sections.
3. **Two to four themes per section** is normal. More than five usually means some are
   weak.
4. **Most specific wins.** Prefer **blood of jesus** over **jesus** when the line is about
   the blood.
5. **New themes:** lowercase, no punctuation, at most 60 characters (`spiritual warfare`,
   not `Spiritual Warfare!`). Never use a lyric line as a theme.
6. **Seasons and liturgy** (`advent`, `communion`, `call to worship`) are themes too. Add
   them when the song is clearly written for that use.

Example, A Thousand Hallelujahs: chorus **glory**, **honor**, **forever**; verse 1
**creation**, **rocks cry out**.

## 5. Files and links

Each file belongs to **one key**, except projection files, which belong to the whole song.
Upload a chart under the key it is **written in**. Files must be under 50 MB.

| Kind        | Accepted                    | Per key? |
| ----------- | --------------------------- | -------- |
| Full score  | PDF                         | Yes      |
| Lead sheet  | PDF                         | Yes      |
| Chord chart | PDF (several allowed)       | Yes      |
| Audio       | MP3, M4A or link            | Yes      |
| Video link  | YouTube or other link       | Yes      |
| Instruction | Link, MP3 or PDF            | Yes      |
| Projection  | PRO, MDB, PPT, PPTX or link | No       |

### Naming files for bulk import

```
<Title> - <Key> - <Kind>.<ext>
<Title> - <Key> - <Kind> 2.<ext>     (second file of the same kind)
<Title> - Projection.<ext>
```

| Good                                       | Bad (why)                                      |
| ------------------------------------------ | ---------------------------------------------- |
| `1000 Hallelujahs - D - Chord Chart.pdf`   | `1000 hallelujahs chords.pdf` (no key or kind) |
| `1000 Hallelujahs - D - Chord Chart 2.pdf` | `1000 Hallelujahs - D - Chords.pdf` (bad kind) |
| `1000 Hallelujahs - Db - Lead Sheet.pdf`   | `1000 Hallelujahs - Db major - Lead Sheet.pdf` |
| `1000 Hallelujahs - E - Audio.mp3`         | `1000 Hallelujahs-E-Audio.mp3` (no spaces)     |
| `1000 Hallelujahs - Projection.pro`        | `1000 Hallelujahs - D - Projection.pro` (key)  |

- **Kind** is `Full Score`, `Lead Sheet`, `Chord Chart`, `Audio` (or `MP3`) or
  `Instruction`. Capitals don't matter.
- **Title** must match the song's title or an alternate title.
- **Key** is spelled as in section 2 and must be one of the song's keys.

## 6. Other details

- **Title:** the most common name; other names go in **Alternate titles**.
- **Composers:** in credited order. Mark People of Praise members as past or current.
- **Year:** the year written, not the year of your recording.
- **Branch usage:** high, low, rare or none. Fill in only branches you know.
- **Lyrics stay in the lyric fields.** Never put them in notes, file names or themes.
