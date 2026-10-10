import { FretboardDiv } from '../fretboard';
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
