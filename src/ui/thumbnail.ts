import { FretboardDiv } from '../fretboard';
import { renderNotation } from '../notation';
import { renderProgression } from '../progression';
import { hashString } from '../util';

const cache = new Map<string, string | null>();

// Renders snippet code to a PNG data URL for list thumbnails (null if the
// code doesn't render). Results are cached by code.
export function thumbnail(code: string): string | null {
  const key = hashString(code);
  if (cache.has(key)) return cache.get(key)!;
  const div = new FretboardDiv();
  let url: string | null = null;
  try {
    url = div.build(code).toDataURL('image/png');
  } catch {
    url = null;
  } finally {
    div.destroy();
  }
  if (cache.size > 300) cache.clear();
  cache.set(key, url);
  return url;
}

const notationCache = new Map<string, SVGSVGElement | null>();

// Notation thumbnails stay SVG (an image couldn't use the page's music font);
// callers get their own copy.
export function notationThumbnail(code: string): SVGSVGElement | null {
  const key = hashString(code);
  if (!notationCache.has(key)) {
    let svg: SVGSVGElement | null = null;
    try {
      svg = renderNotation(code).svg;
    } catch {
      svg = null;
    }
    if (notationCache.size > 300) notationCache.clear();
    notationCache.set(key, svg);
  }
  return (notationCache.get(key)?.cloneNode(true) as SVGSVGElement | undefined) ?? null;
}

const progressionCache = new Map<string, SVGSVGElement | null>();

export function progressionThumbnail(code: string): SVGSVGElement | null {
  const key = hashString(code);
  if (!progressionCache.has(key)) {
    let svg: SVGSVGElement | null = null;
    try {
      svg = renderProgression(code).svg;
    } catch {
      svg = null;
    }
    if (progressionCache.size > 300) progressionCache.clear();
    progressionCache.set(key, svg);
  }
  return (progressionCache.get(key)?.cloneNode(true) as SVGSVGElement | undefined) ?? null;
}
