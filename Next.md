# Next

Ideas for what to build next, roughly in order. Nothing here is decided yet.

## Chromatic notation

Convert or fork the notation engine (`src/notation/`) so that it:

- **Displays chromatic notation** instead of standard notation: one position per
  semitone, so every interval looks the same in every key, with no key
  signatures or accidentals.
- **Is typed with integer note values** instead of note names, e.g. pitch classes
  0–11 plus an octave, or MIDI numbers (60 = middle C).

To decide:

- Which chromatic system to draw (e.g. Klavarskribo, Equiton, Twinline, a 6-6
  staff), or one of our own.
- The integer convention: 0 = C or 0 = the tonic? Octave numbers or MIDI?
- Convert or fork: replace standard notation, or add a separate snippet type
  next to it. A fork keeps standard notation working; much of the existing code
  could be shared (parsing of measures, ties, tuplets, lyrics, text, tab, the
  layout).
- How rhythm is shown: borrow standard note values, or something else.
- Whether VexFlow is still the right renderer, since chromatic staves would
  replace most of what it draws.

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
