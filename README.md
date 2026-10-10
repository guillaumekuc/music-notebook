# Music Notebook

A single-page app for taking quick musical notes. Each snippet is one of:

- **Fretboard:** a guitar or bass fretboard diagram, written in a small text
  language and rendered with a TypeScript port of
  [0xfe/fretboard](https://github.com/0xfe/fretboard).
- **Notation:** standard music notation, rendered with
  [VexFlow](https://www.vexflow.com) (see [Notation syntax](#notation-syntax)).
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
- **Save PNG** and **Save SVG** work for notation too; the SVG embeds the music
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
  mirrored there as real directories, `.fret`, `.notation` and `.md` files:

  ```
  Chords/
    G major.fret
  Scales/
    A minor pentatonic.fret
    Practice log.md
  ```

  Each `.fret` and `.notation` file starts with an `# id / # name / # tags`
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

A thin layer over VexFlow's [EasyScore](https://github.com/vexflow/vexflow/wiki)
note syntax:

```
clef treble                    treble, bass, alto, tenor, percussion
key G                          key signature: C, G, D, F, Bb, F#, Am, Em, ...
time 4/4                       time signature (C for common time)
width 700                      width in px; measures wrap onto new lines
voice G4/q, A4, B4, C5 | D5/8, E5, F#5, G5, D5/h | (G4 B4 D5)/1
voice G3/h, D4 | B3/1 | G3/1   a second voice
```

- `|` separates measures. A voice line may be shorter than another; its missing
  measures are empty.
- Notes: `C#4`, `Bb4`, `Fn4` (natural); durations `/w /h /q /8 /16` carry over
  to the next note until changed; `C4/q.` is dotted; `(C4 E4 G4)/h` is a chord;
  `B4/q/r` is a rest.
- Write notes as they sound: the key signature decides which accidentals are
  drawn, and accidentals carry through the measure.
- Eighths and shorter are beamed automatically. With two voices, the first has
  stems up and the second stems down.
- Lines starting with `#` are comments.

Code: `src/notation/`. The music fonts (Bravura and Academico, SIL OFL) are
bundled, so notation works offline.

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
