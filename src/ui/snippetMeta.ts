import type { Library } from '../storage/library';
import { escapeHtml } from '../util';
import { icons } from './icons';

export type SaveState = 'saved' | 'saving' | 'draft';

export interface SnippetMetaHandlers {
  rename(name: string): void;
  move(folderId: string | null): void;
  setTags(tags: string[]): void;
  duplicate(): void;
  remove(): void;
  saveDraft(): void;
}

// Name, folder, tags and save state of the open snippet, shown above the code.
export class SnippetMeta {
  private readonly nameInput: HTMLInputElement;
  private readonly folderSelect: HTMLSelectElement;
  private readonly tagsEl: HTMLSpanElement;
  private readonly tagInput: HTMLInputElement;
  private readonly suggestions: HTMLDataListElement;
  private readonly saveStateEl: HTMLSpanElement;
  private readonly draftBanner: HTMLDivElement;
  private tags: string[] = [];
  private shownId: string | null = null;

  constructor(root: HTMLElement, private readonly library: Library, handlers: SnippetMetaHandlers) {
    root.innerHTML = `
      <div class="draft-banner" hidden>
        <span>This snippet came from a shared link and isn't in your library yet.</span>
        <button type="button" class="btn btn-small btn-primary" data-act="save-draft">Save to library</button>
      </div>
      <div class="meta-row">
        <input class="name-input" aria-label="Snippet name" placeholder="Untitled" maxlength="120" />
        <span class="save-state" aria-live="polite"></span>
      </div>
      <div class="meta-row meta-details">
        <label class="field">${icons.folder}<select class="folder-select" aria-label="Folder"></select></label>
        <div class="tag-editor">
          <span class="tag-list"></span>
          <input class="tag-input" placeholder="Add tag…" aria-label="Add tag" list="tag-suggestions" />
          <datalist id="tag-suggestions"></datalist>
        </div>
        <span class="meta-actions">
          <button type="button" class="btn btn-small" data-act="duplicate">Duplicate</button>
          <button type="button" class="btn btn-small btn-danger" data-act="delete">${icons.trash} Delete</button>
        </span>
      </div>
    `;
    this.nameInput = root.querySelector('.name-input')!;
    this.folderSelect = root.querySelector('.folder-select')!;
    this.tagsEl = root.querySelector('.tag-list')!;
    this.tagInput = root.querySelector('.tag-input')!;
    this.suggestions = root.querySelector('datalist')!;
    this.saveStateEl = root.querySelector('.save-state')!;
    this.draftBanner = root.querySelector('.draft-banner')!;

    this.nameInput.addEventListener('change', () => handlers.rename(this.nameInput.value));
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.nameInput.blur();
    });
    this.folderSelect.addEventListener('change', () => handlers.move(this.folderSelect.value || null));

    const addTags = () => {
      const added = this.tagInput.value.split(',').map((t) => t.trim()).filter(Boolean);
      this.tagInput.value = '';
      if (added.length) handlers.setTags([...this.tags, ...added]);
    };
    this.tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTags();
      } else if (e.key === 'Backspace' && !this.tagInput.value && this.tags.length) {
        handlers.setTags(this.tags.slice(0, -1));
      }
    });
    this.tagInput.addEventListener('change', addTags);

    root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const removeTag = target.closest<HTMLElement>('[data-remove-tag]')?.dataset.removeTag;
      if (removeTag) return handlers.setTags(this.tags.filter((t) => t !== removeTag));
      switch (target.closest<HTMLElement>('[data-act]')?.dataset.act) {
        case 'duplicate': return handlers.duplicate();
        case 'delete': return handlers.remove();
        case 'save-draft': return handlers.saveDraft();
      }
    });
  }

  focusName(): void {
    this.nameInput.focus();
    this.nameInput.select();
  }

  // Shows a library snippet, or a draft (not in the library) when id is null.
  show(snippet: { id: string | null; name: string; folderId: string | null; tags: string[] }): void {
    const draft = snippet.id == null;
    this.draftBanner.hidden = !draft;
    // Don't overwrite the name while it is being typed.
    if (snippet.id !== this.shownId || document.activeElement !== this.nameInput) this.nameInput.value = snippet.name;
    this.shownId = snippet.id;
    this.nameInput.disabled = draft;
    this.tags = snippet.tags;

    const options = ['<option value="">Library (no folder)</option>'];
    const visit = (parentId: string | null, depth: number) => {
      for (const f of this.library.childFolders(parentId)) {
        options.push(`<option value="${f.id}">${'  '.repeat(depth)}${escapeHtml(f.name)}</option>`);
        visit(f.id, depth + 1);
      }
    };
    visit(null, 0);
    this.folderSelect.innerHTML = options.join('');
    this.folderSelect.value = snippet.folderId ?? '';

    this.tagsEl.innerHTML = this.tags.map((t) => `
      <span class="chip active">${escapeHtml(t)}<button type="button" class="chip-remove" data-remove-tag="${escapeHtml(t)}"
        aria-label="Remove tag ${escapeHtml(t)}">×</button></span>`).join('');
    this.suggestions.innerHTML = this.library.tagCounts()
      .filter(([t]) => !this.tags.includes(t))
      .map(([t]) => `<option value="${escapeHtml(t)}"></option>`).join('');

    for (const el of [this.folderSelect, this.tagInput]) el.disabled = draft;
    for (const btn of this.draftBanner.parentElement!.querySelectorAll<HTMLButtonElement>('.meta-actions button')) {
      btn.disabled = draft;
    }
    if (draft) this.setSaveState('draft');
  }

  setSaveState(state: SaveState): void {
    this.saveStateEl.dataset.state = state;
    this.saveStateEl.textContent = state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : 'Not saved';
  }
}
