# Next

Ideas for what to build next, roughly in order. Only the chromatic notation
design below is decided.

## Chromatic notation

Notation with one position per semitone, so every interval looks the same in
every key, with no key signatures or accidentals. Researched on
[musicnotation.org](https://musicnotation.org/).

Decided:

- **Staff: Klaus Lieber's** ([1983](https://musicnotation.org/system/untitled-by-klaus-lieber/)).
  Lines a whole step apart, six per octave, all drawn: C D E F♯ G♯ A♯. Every C
  is a bold line that separates the octaves, so even notes sit on lines and odd
  notes in spaces. Octaves stack and share their bold C.
- **Notes are MIDI numbers**, with C4 = 60 (not the Yamaha C3 = 60). The octave
  is `floor(n / 12) − 1`.
- **Two-colour noteheads with a 6-6 pattern:** notes on lines and notes in
  spaces get different colours. This repeats what the position says, but makes
  half-step motion visible at a glance. The 7-5 pattern (black keys solid, as
  in Klavar) is avoided because it builds C major back in.
- **Rhythm is standard notation except half notes, which get a double stem**
  (as in [TwinNote](https://musicnotation.org/system/twinnote-by-paul-morris/)).
  Whole notes have no stem, so either colour works; quarters and shorter keep
  their stems, flags and beams; dots, ties, tuplets and rests are unchanged.
- **No clef: an octave number** (4 for 60–71) next to each octave of the staff.
- **Range: set explicitly** by the user at first (e.g. octaves 3–5). Notes
  outside it get ledger lines.

Later: pick the range automatically. Draft rules, in order of preference:

1. The core range is the octaves that hold most of the notes.
2. Ledger lines for notes up to about 4 semitones (2 ledger lines) past an
   outer bold C.
3. An 8va / 8vb shift for a single bar whose notes are mostly further out, if
   shifting puts them inside the core range.
4. Add a whole octave only when notes outside the range are frequent (several
   bars, or more than some share of the notes).

Still open: which colour the line notes get, and whether to add a variant with
plain noteheads.

## Decouple note input from the staff

Today the staff decides how notes are written: note names (`C#4`) on standard
staves, MIDI numbers (`61`) on `staff chromatic`. The two should be
independent, so either kind of staff accepts either kind of input:

- MIDI numbers on a standard staff, spelled from the key signature (61 is C♯
  in D major, D♭ in A♭ major).
- Note names on a chromatic staff, which only needs their pitch.

Ideally the parser tells which one a note is by itself: a bare number is MIDI,
a letter is a note name. Tab's `fret/string` notes need care, since they are
numbers too.

## Remove the search thumbnails

The images in the library's search results are too small to read, and snippet
names are evocative enough. Remove them (`src/ui/sidebar.ts`,
`src/ui/thumbnail.ts`) and show name, folder, tags and date only.

## A format for chord progressions

A dedicated snippet type for chord progressions and the relationships between
chords, laid out as a bar grid.

To decide:

- Chord symbols (`Dm7 G7 Cmaj7`), Roman numerals (`ii V I`), or both, and
  whether the app converts between them for a given key.
- How to show relationships: functions, root movement, common tones, voice
  leading.
- Bar grid details: chords per bar, repeats, endings, sections (A, B, bridge).
- How it relates to the `| Dm7 | G7 |` chord charts that already work inside
  Markdown notes.

## Sound preview (maybe)

Play back what a snippet shows: notation, a chord progression, or the notes on
a fretboard. Possibly with the Web Audio API and a simple synth or sampled
instrument, a tempo control, and a highlight on what is playing.
