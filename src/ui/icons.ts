const svg = (body: string) =>
  `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  caret: svg('<path d="M6 4l4 4-4 4"/>'),
  folder: svg('<path d="M1.75 4.25v8h12.5v-6.5h-6.5l-1.5-1.5h-4.5z"/>'),
  fretboard: svg('<path d="M1.75 4.25h12.5v7.5H1.75zM1.75 6.75h12.5M1.75 9.25h12.5M5.5 4.25v7.5M9.5 4.25v7.5"/>'),
  note: svg('<path d="M3.75 1.75h5.5l3 3v9.5h-8.5z"/><path d="M5.5 7.5h5M5.5 10h5"/>'),
  newFretboard: svg('<path d="M1.75 4.25h7.5M1.75 8h7.5M1.75 11.75h5M4.75 2.5v11"/><path d="M12 9v5M9.5 11.5h5"/>'),
  newNote: svg('<path d="M9.25 1.75h-5.5v12.5h4"/><path d="M9.25 1.75l3 3v2.5"/><path d="M12 9v5M9.5 11.5h5"/>'),
  plus: svg('<path d="M8 3v10M3 8h10"/>'),
  folderPlus: svg('<path d="M1.75 4.25v8h12.5v-6.5h-6.5l-1.5-1.5h-4.5z"/><path d="M8 7v4M6 9h4"/>'),
  pencil: svg('<path d="M10.5 2.5l3 3-8 8h-3v-3z"/>'),
  trash: svg('<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.75 9.5h6.5L12 4"/>'),
  library: svg('<path d="M2.5 2.5v11M5.5 2.5v11M8.5 3l3.5 10.5"/>'),
  close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  sync: svg('<path d="M13 5.5A5.25 5.25 0 0 0 3.2 6M3 10.5A5.25 5.25 0 0 0 12.8 10"/><path d="M13 2.5v3h-3M3 13.5v-3h3"/>'),
};
