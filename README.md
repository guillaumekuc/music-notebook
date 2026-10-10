# Music Notebook

A single-page app for taking quick musical notes. Each snippet is one of:

- **Fretboard:** a guitar or bass fretboard diagram, written in a small text
  language and rendered with a TypeScript port of
  [0xfe/fretboard](https://github.com/0xfe/fretboard).
- **Markdown note:** plain notes in Markdown (GitHub flavour: tables, task lists,
  strikethrough). A single line break is kept as a line break.

Create either kind with the buttons at the top of the library.

- The preview re-renders as you type. If fretboard code has an error, the last
  good render stays on screen (dimmed) and the error shows with its line number.
- **Save PNG** exports at 1×–4× scale, on white or a transparent background
  (shortcut: Ctrl/Cmd+Shift+S). **Save SVG** exports vector output.
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
  mirrored there as real directories, `.fret` files and `.md` files:

  ```
  Chords/
    G major.fret
  Scales/
    A minor pentatonic.fret
    Practice log.md
  ```

  Each `.fret` file starts with an `# id / # name / # tags` header. These are
  comments in the fretboard syntax, so every file is still valid fretboard code.
  Each `.md` file holds the same fields as YAML front matter; other front matter
  keys (from Obsidian, say) are kept. Any `.md` file in the folder becomes a
  note, so existing Markdown notes can be dropped in. You can
  create, edit, rename, move or delete files outside the app; changes are picked
  up when the tab regains focus (and every minute). If a snippet was edited in
  both places, the app keeps your local version and adds the folder's version
  as "<name> (conflict)". The browser asks you to allow access to the folder again
  once per session.
- **Back up or move without sync (any browser):** use **Export JSON** /
  **Import JSON**. Importing merges by snippet id, and the newer version wins.

Code: `src/storage/` (library, IndexedDB, folder sync, backup) and `src/ui/`
(sidebar, snippet header).

## Syntax

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
