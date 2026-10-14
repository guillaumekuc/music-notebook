# Music Notebook

A single-page app for taking quick musical notes. Each snippet is one of:

- **Fretboard:** a guitar or bass fretboard diagram, written in a small text
  language and rendered with a TypeScript port of
  [0xfe/fretboard](https://github.com/0xfe/fretboard).
- **Notation:** standard music notation, rendered with
  [VexFlow](https://www.vexflow.com) (see [Notation syntax](#notation-syntax)).
- **Chord progression:** a bar grid of chords, written as chord symbols, chord
  relationships or both (see [Progression syntax](#progression-syntax)).
- **Markdown note:** plain notes in Markdown (GitHub flavour: tables, task lists,
  strikethrough). A single line break is kept as a line break.

Create each kind with the buttons at the top of the library.

Markdown notes have a few music-notebook extras:

````md
```fretboard                  a fretboard diagram inside the note,
option frets=5                written in the fretboard syntax
show fret=3 string=6 text=G
```

```notation                   music notation inside the note
key D
voice D5/q, C#5, B4, A4
```

```progression                a chord progression grid
| Am | bIII.M | bVII.M |
```

| Dm7 | G7 | Cmaj7 % |        a chord chart: one bar per cell
| Bbmaj7 | E7(#9) | Am/G |

[[G major]]                   link to a snippet by name; clicking a link to
[[G major|the shape]]         a missing name creates that note

- [ ] scales                  task boxes can be ticked in the preview
````

- Paste or drop an image into the editor to add it to the note. Images are kept
  with the library and referenced as `attachments/<name>`.
- Ctrl/Cmd+B bold, Ctrl/Cmd+I italic, Ctrl/Cmd+K link; Enter continues a list
  (Enter on an empty item ends it).
- **View** switches between the preview above the editor, side by side (on wide
  screens) and preview only.

- The preview re-renders as you type. If fretboard code has an error, the last
  good render stays on screen (dimmed) and the error shows with its line number.
- **Save PNG** exports at 1×–4× scale, on white or a transparent background
  (shortcut: Ctrl/Cmd+Shift+S). **Save SVG** exports vector output.
- **Save PNG** and **Save SVG** work for notation and progressions too; the SVG embeds the music
  font, so it displays correctly anywhere.
- **Save .md** downloads a Markdown note as a file.
- **Copy share link** puts the code in the URL. Opening such a link shows it as a
  draft that you can save to your library. Shared Markdown is sanitised before
  it is shown.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Snippet library

Snippets save automatically as you type. They live in the browser's IndexedDB
storage, so the app works offline and needs no server or account.

- **Organize:** use folders (which can contain folders) and tags. Drag snippets
  and folders onto a folder to move them. Double-click a folder to rename it.
  Deleting a folder moves its contents up a level, and every delete can be undone.
- **Find:** search matches names, tags and code. Click tag chips to filter.
  Search and filter results show a thumbnail of each snippet.
- **Use on several devices (Chrome/Edge):** click **Connect folder…** and pick a
  folder inside Dropbox, OneDrive, iCloud Drive or a git repo. The library is
  mirrored there as real directories, `.fret`, `.notation`, `.progression` and
  `.md` files:

  ```
  Chords/
    G major.fret
  Scales/
    A minor pentatonic.fret
    Practice log.md
  ```

  Each `.fret`, `.notation` and `.progression` file starts with an `# id / # name / # tags`
  header. These are comments in both syntaxes, so every file is still valid code.
  Each `.md` file holds the same fields as YAML front matter; other front matter
  keys (from Obsidian, say) are kept. Any `.md` file in the folder becomes a
  note, so existing Markdown notes can be dropped in. Images live in an
  `attachments/` directory at the top of the folder; new images are copied both
  ways, but deleting an image file doesn't delete it from the app. You can
  create, edit, rename, move or delete files outside the app; changes are picked
  up when the tab regains focus (and every minute). If a snippet was edited in
  both places, the app keeps your local version and adds the folder's version
  as "<name> (conflict)". The browser asks you to allow access to the folder again
  once per session.
- **Back up or move without sync (any browser):** use **Export JSON** /
  **Import JSON**. Importing merges by snippet id, and the newer version wins.
  Images are included in the export.

Code: `src/storage/` (library, IndexedDB, folder sync, backup), `src/markdown.ts`
(Markdown rendering and its extensions) and `src/ui/` (sidebar, snippet header,
note view, Markdown editor keys).

## Notation syntax

Notes are written in VexFlow's
[EasyScore](https://github.com/0xfe/vexflow/wiki/Using-EasyScore) syntax. EasyScore
only describes notes, so this format adds measures, staves, tab and the marks
EasyScore leaves to code. Where it can, it borrows from ABC and LilyPond.

```
clef treble                    treble, bass, alto, tenor, percussion
key G                          key signature: C, G, D, F, Bb, F#, Am, Em, ...
time 4/4                       time signature (C for common time)
tempo "Allegro" q=132          tempo mark (or just: tempo 120)
width 700                      width in px; measures wrap onto new lines
voice G4/q, A4, B4, C5 | D5/8, E5, F#5, G5, D5/h | (G4 B4 D5)/1
voice G3/h, D4 | B3/1 | G3/1   a second voice
lyrics Hel- lo world           one word per note of the voice above
```

**Notes.** `C#4`, `Bb4`, `Fn4` (natural); durations `/w /h /q /8 /16` carry on
to the next notes until changed, also across bar lines; `C4/q.` is dotted;
`(C4 E4 G4)/h` is a chord; `B4/q/r` is a rest. EasyScore's own options, like
`C4/q[fingerings="1"]`, work too.

| Write | For |
| --- | --- |
| `C4/h~, C4/q` | a tie, also across bar lines and line breaks |
| `(C4/8, D4, E4)` | a slur: `(` before the first note, `)` after the last |
| `{C5/8, D5, E5}` | a triplet; `{5:4 ...}` for another ratio |
| `.C4` `-C4` `>C4` `^C4` `@C4` | staccato, tenuto, accent, marcato, fermata |
| `"Am7"C4` / `_"rit."C4` | text above (chord symbols) / below the staff |
| `!mf!C4` | dynamics: `ppp` to `fff`, `sfz`, `fp`, ... |
| `\|\|` `\|]` `\|:` `:\|` `:\|:` | double, final and repeat bar lines |
| `[key D]` `[time 3/4]` `[clef bass]` | a change, at the start of a measure |

**Staves.** `staff bass` starts another staff; voices after it belong to it. Two
notation staves are drawn as a grand staff with a brace.

**Chromatic staff.** `staff chromatic` draws a chromatic staff after Klaus
Lieber (1983), with one place per semitone and no key signatures or
accidentals. Lines are a whole step apart, six per octave (C D E F♯ G♯ A♯), and
every C is a bold line between octaves. Notes are MIDI numbers, with 60 = C4:
`60/q`, `(60 64 67)/h` for a chord, `r/q` for a rest. Even notes sit on lines
and have solid noteheads; odd ones sit in spaces and are hollow. Since colour
shows pitch, a half note has a double stem instead. Rhythm otherwise works as
in standard notation, and so do ties, slurs, tuplets, marks, text and lyrics.
In place of a clef, each octave is labelled with its number. `range=3-5` shows
octaves 3 to 5 (`range=4` one octave); without it, the staff shows the octaves
its notes are in. Notes outside the range get ledger lines.

**Tab.** `staff tab` starts a guitar tab staff; `staff tab notation` also draws
the notes in standard notation above it, worked out from the frets.
`tuning=` takes `standard`, `dropd`, `dadgad`, `open-g`, `open-d`,
`half-step-down`, `bass`, `bass-5`, `standard-7`, `ukulele`, or notes like
`E/5,B/4,G/4,D/4,A/3,E/3`. Tab notes are `fret/string`: `5/3`,
`(0/1 1/2 0/3)/h` for a chord, `x/6` muted, `r/q` a rest. After a note, `h`, `p`
and `s` make a hammer-on, pull-off or slide to the next note; `b` bends it and
`v` adds vibrato.

Write notes as they sound: the key signature decides which accidentals are
drawn, and accidentals carry through the measure. Short notes are beamed
automatically; with two voices the first has stems up and the second down.
Lines starting with `#` are comments.

**Not supported yet:** grace notes, volta brackets (1st/2nd endings),
crescendo hairpins, ottava lines, cross-staff beams and multi-measure rests.

Code: `src/notation/` (`parse.ts` reads the text, `render.ts` lays it out with
VexFlow, `chromatic.ts` draws chromatic staves). The music fonts (Bravura and Academico, SIL OFL) are bundled, so
notation works offline.

## Progression syntax

A progression is drawn as a grid with one cell per bar. Each chord shows its
symbol and its **chord relationship** (CR): how it relates to the chord before
it, written as in [Chordex](https://guillaumekuc.github.io/chordex/). `m ♭III M`
reads "from a minor chord, up a minor third to a major chord". Write either
one and the other is worked out; the two can be mixed freely.

```
root A                         the root the first chord relates to (optional)
width 700                      grid width in px
tempo 100                      quarter notes per minute, for Play
time 3/4                       beats per bar, for Play (default 4/4)
section A                      a label for the rows that follow
|: I.m(b7) | bIII.M | bVII.M | IV.M(b7) |
| Am  G | F  E7 |[1 Am | E7 :|[2 Am | % ||
section B
| Dm | V.M(b7) | Cmaj7 / / A7 | N.C. :|x2
```

**Rows and bars.** Each line is one row. `|` separates bars; `||`, `|]`, `|:`,
`:|` and `:|:` are double, final and repeat bar lines, and `:|x3` adds a repeat
count. `[1`, `[2` after a bar line start a 1st or 2nd ending. The chords in a
bar share it evenly; `/` holds the chord before for one more slot (`C / / G`),
`%` repeats the previous bar and `N.C.` is no chord.

**Chords.** A chord symbol: `Am`, `Bb7`, `F#m7b5`, `C6/9`, `G/B`. Or a
relationship, `interval.quality(added)`:

| Part | Values |
| --- | --- |
| interval | a Roman numeral up from the previous chord's root: `I` `bII` `II` `bIII` … `VII` (`b`/`♭`, `#`/`♯`) |
| quality | `M` major, `m` minor, `d` diminished, `A` augmented |
| added | intervals added above the root: `7` (major 7th), `b7` (minor 7th), `bb7`, `6`, `9`, `b9`, `#11`, `13`, … |

So `V.M(b7)` is a dominant 7th a fifth up, `bIII.M(7,9)` a maj9 a minor third
up. `I.m(11)` keeps the root and makes it minor; it is also how a
progression without a root starts.

**Working it out.** A relationship is measured from the chord written before
it. For the first chord that is `root`, when there is one. Without a root, a
progression written in relationships shows only the relationships; an absolute
chord after them shows its symbol but no relationship. Relationships skip
`N.C.` and follow `%`, and a 2nd ending is measured from the chord before the
1st. The root of a relationship is spelled from its numeral (`bIII` above A is
C, `#IV` above C is F♯), and chord symbols are built from the quality and the
added intervals (M + ♭7 is `7`, M + 7 `maj7`, d + ♭7 `ø7`). Sus and power
chords have no triad quality, so their relationships show `?`.

**Play** (Ctrl/Cmd+Space) plays the progression and highlights each bar as it
plays. It follows repeats and endings: a repeated section plays twice (or `xN`
times), with the 1st ending the first time and the 2nd after. Each chord is
voiced close to the one before, in the inversion that moves the voices least
(as in Chordex), over its root (or slash bass) in the bass. Chords split a bar
evenly, `/` keeps a chord sounding and `N.C.` is silent. A progression with no
root plays as if it started on C.

Code: `src/progression/` (`theory.ts` chords and intervals, `parse.ts` the text
and the relationships, `render.ts` the SVG grid, `playback.ts` the play order
and voicing).

## Fretboard syntax

```
fretboard                         # optional header, ignored
option width=700                  # canvas size in px (default 700x150)
option height=150
option strings=6
option start=5                    # first fret shown; 1 draws the nut
option frets=12                   # last fret shown
option start-text=5th Fret        # label under the first fret when start > 1

show fret=3 string=6 text=G
show frets=3,4,5 strings=1,2 color=red
show notes=10/1,10/2,9/3 fill-color=white color=#666
```

Strings are numbered from the top (1 = high E). Fret 0 is an open string.

## Changes from the original library

- No jQuery, Underscore or global `Vex` namespace. It uses Paper.js 0.12 as an
  ES module, and `FretboardDiv.build()` returns the canvas.
- Fret spacing uses the real fret positions for the range shown, so views high
  up the neck taper correctly.
- The last fret (`frets=N`) is now drawn and can hold notes. In the original
  it ended up at an invalid (NaN) position.
- Position markers are placed correctly for any number of strings.
- Errors include line numbers, and unknown commands are reported instead of
  being silently ignored. `#` comments are allowed.
- `show` values can be quoted to include spaces (`text="5 fr"`), and
  `option` values may contain spaces.

Original library © 2013 Mohit Muthanna Cheppudira, MIT License.
