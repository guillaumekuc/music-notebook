import { FretboardDiv } from '../fretboard';
import { renderMarkdown, type MusicBlock } from '../markdown';
import { renderNotation } from '../notation';
import { renderProgression } from '../progression';
import type { Library } from '../storage/library';
import { escapeHtml } from '../util';
import { icons } from './icons';

export interface NoteViewHandlers {
  // Folder of the open note, so links prefer snippets next to it.
  folderId(): string | null;
  openLink(target: string): void;
  setTask(index: number, checked: boolean): void;
  // Plays (or stops) a ```notation or ```progression block.
  play(kind: 'notation' | 'progression', code: string, block: HTMLElement): void;
}

type Drawing = { url: string } | { svg: SVGSVGElement } | { error: string };

// Shows a rendered Markdown note, and brings its parts to life: ```fretboard,
// ```notation and ```progression blocks become drawings (the last two with a
// play button), [[links]] open snippets, task boxes can be ticked and pasted
// images load from the library.
export class NoteView {
  private readonly drawings = new Map<string, Drawing>();
  private blocks: MusicBlock[] = [];
  private readonly imageUrls = new Map<string, string>();

  constructor(
    private readonly el: HTMLElement,
    private readonly library: Library,
    private readonly handlers: NoteViewHandlers,
  ) {
    el.addEventListener('click', (e) => {
      const play = (e.target as HTMLElement).closest<HTMLElement>('.block-play');
      const playBlock = play?.closest<HTMLElement>('.music-block');
      const playable = playBlock && this.blocks[Number(playBlock.dataset.block)];
      if (playable && playable.kind !== 'fretboard') return handlers.play(playable.kind, playable.code, playBlock);
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.wikilink');
      if (!link) return;
      e.preventDefault();
      handlers.openLink(link.dataset.target!);
    });
    el.addEventListener('change', (e) => {
      const box = e.target as HTMLInputElement;
      if (box.matches('input.task')) handlers.setTask(Number(box.dataset.task), box.checked);
    });
  }

  render(text: string): void {
    const { html, blocks } = renderMarkdown(text);
    this.el.innerHTML = html;
    this.blocks = blocks;

    for (const el of this.el.querySelectorAll<HTMLElement>('.music-block')) {
      const block = blocks[Number(el.dataset.block)];
      if (!block) continue;
      const drawing = this.draw(block);
      if ('svg' in drawing) {
        el.replaceChildren(drawing.svg.cloneNode(true));
        el.insertAdjacentHTML('beforeend', `<button type="button" class="block-play" title="Play" aria-label="Play">${icons.play}</button>`);
      }
      else if ('url' in drawing) el.innerHTML = `<img src="${drawing.url}" alt="Fretboard diagram" />`;
      else el.innerHTML = `<p class="block-error">${escapeHtml(drawing.error)}</p>`;
    }

    for (const link of this.el.querySelectorAll<HTMLAnchorElement>('a.wikilink')) {
      const target = this.library.findByName(link.dataset.target!, this.handlers.folderId());
      link.classList.toggle('missing', !target);
      link.title = target ? `Open “${target.name}”` : `Create note “${link.dataset.target}”`;
    }

    this.el.querySelectorAll<HTMLInputElement>('input.task').forEach((box, i) => {
      box.dataset.task = String(i);
    });

    for (const img of this.el.querySelectorAll<HTMLImageElement>('img[data-asset]')) void this.loadImage(img);
  }

  // Drawings are SVG, so they stay sharp at any size, and cached by code so
  // typing elsewhere in the note doesn't redraw them. Notation stays inline so
  // it can use the page's music font.
  private draw({ kind, code }: MusicBlock): Drawing {
    const key = `${kind}:${code}`;
    const cached = this.drawings.get(key);
    if (cached) return cached;
    let drawing: Drawing;
    if (kind === 'notation' || kind === 'progression') {
      try {
        drawing = { svg: (kind === 'notation' ? renderNotation(code) : renderProgression(code)).svg };
      } catch (e) {
        drawing = { error: e instanceof Error ? e.message : String(e) };
      }
      return this.remember(key, drawing);
    }
    const div = new FretboardDiv();
    try {
      div.build(code);
      let svg = div.scope!.project.exportSVG({ asString: true, bounds: 'view' }) as string;
      const { width, height } = div.options;
      if (!/<svg[^>]*viewBox/.test(svg)) svg = svg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
      drawing = { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
    } catch (e) {
      drawing = { error: e instanceof Error ? e.message : String(e) };
    } finally {
      div.destroy();
    }
    return this.remember(key, drawing);
  }

  private remember(key: string, drawing: Drawing): Drawing {
    if (this.drawings.size > 200) this.drawings.clear();
    this.drawings.set(key, drawing);
    return drawing;
  }

  private async loadImage(img: HTMLImageElement): Promise<void> {
    const name = img.dataset.asset!;
    let url = this.imageUrls.get(name);
    if (!url) {
      const asset = this.library.hasAsset(name) ? await this.library.getAsset(name) : undefined;
      if (!asset) {
        img.replaceWith(Object.assign(document.createElement('span'), {
          className: 'missing-image',
          textContent: `Missing image: ${name}`,
        }));
        return;
      }
      url = URL.createObjectURL(asset.blob);
      this.imageUrls.set(name, url);
    }
    img.src = url;
  }
}
