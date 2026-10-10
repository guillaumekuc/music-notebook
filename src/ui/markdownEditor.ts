import { ATTACHMENTS_DIR } from '../storage/types';

export interface MarkdownEditorOptions {
  // Whether the open snippet is a Markdown note; the editor does nothing otherwise.
  active(): boolean;
  // Stores an image and returns its attachment name.
  saveImage(file: File): Promise<string>;
}

// Replaces start..end with text through the browser's editing commands, so
// Ctrl+Z still works and an input event fires.
function insert(ta: HTMLTextAreaElement, text: string, start = ta.selectionStart, end = ta.selectionEnd) {
  ta.focus();
  ta.setSelectionRange(start, end);
  if (!document.execCommand('insertText', false, text)) {
    ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input'));
  }
}

// Wraps the selection in a marker (** or *), or removes it if already there.
function toggleWrap(ta: HTMLTextAreaElement, marker: string) {
  const { value, selectionStart: s, selectionEnd: e } = ta;
  const m = marker.length;
  const inner = value.slice(s, e);
  if (inner.length >= 2 * m && inner.startsWith(marker) && inner.endsWith(marker)) {
    insert(ta, inner.slice(m, -m));
    ta.setSelectionRange(s, e - 2 * m);
  } else if (value.slice(s - m, s) === marker && value.slice(e, e + m) === marker) {
    insert(ta, inner, s - m, e + m);
    ta.setSelectionRange(s - m, e - m);
  } else {
    insert(ta, marker + inner + marker);
    ta.setSelectionRange(s + m, e + m);
  }
}

function insertLink(ta: HTMLTextAreaElement) {
  const { value, selectionStart: s, selectionEnd: e } = ta;
  const label = value.slice(s, e) || 'link';
  insert(ta, `[${label}](url)`);
  const urlStart = s + label.length + 3;
  ta.setSelectionRange(urlStart, urlStart + 3);
}

const LIST_ITEM = /^(\s*(?:>\s*)*)([-*+]|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?(.*)$/;

// Enter on a list item starts the next item; on an empty item, ends the list.
function continueList(ta: HTMLTextAreaElement): boolean {
  const { value, selectionStart: s, selectionEnd: e } = ta;
  if (s !== e) return false;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const m = value.slice(lineStart, s).match(LIST_ITEM);
  if (!m) return false;
  const [, indent, bullet, num, delim, space, task, content] = m;
  if (!content.trim() && value.slice(s, value.indexOf('\n', s) >>> 0).trim() === '') {
    insert(ta, indent, lineStart, s);
    return true;
  }
  const next = num ? `${Number(num) + 1}${delim}` : bullet;
  insert(ta, `\n${indent}${next}${space}${task ? '[ ] ' : ''}`);
  return true;
}

export function attachMarkdownEditor(ta: HTMLTextAreaElement, options: MarkdownEditorOptions): void {
  ta.addEventListener('keydown', (e) => {
    if (!options.active() || e.isComposing) return;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'b') toggleWrap(ta, '**');
    else if (mod && key === 'i') toggleWrap(ta, '*');
    else if (mod && key === 'k') insertLink(ta);
    else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!continueList(ta)) return;
    } else return;
    e.preventDefault();
  });

  const insertImages = async (files: File[]) => {
    for (const file of files) {
      try {
        const name = await options.saveImage(file);
        insert(ta, `![](${ATTACHMENTS_DIR}/${encodeURI(name)})\n`);
      } catch (err) {
        console.error('Could not store image', err);
      }
    }
  };
  const images = (list: FileList | undefined | null) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'));

  ta.addEventListener('paste', (e) => {
    const files = images(e.clipboardData?.files);
    if (!options.active() || !files.length) return;
    e.preventDefault();
    void insertImages(files);
  });
  ta.addEventListener('dragover', (e) => {
    if (options.active() && e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
  ta.addEventListener('drop', (e) => {
    const files = images(e.dataTransfer?.files);
    if (!options.active() || !files.length) return;
    e.preventDefault();
    ta.focus();
    void insertImages(files);
  });
}
