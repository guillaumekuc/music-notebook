import { marked } from 'marked';
import DOMPurify from 'dompurify';

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n?---[ \t]*(?:\r?\n|$)/;

// Links in notes open in a new tab, so following one never leaves the app.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Renders a Markdown note to sanitised HTML. Notes can arrive through share
// links, so the HTML is never trusted. Front matter is metadata, not content.
export function renderMarkdown(text: string): string {
  const html = marked.parse(text.replace(FRONT_MATTER, ''), { async: false, gfm: true, breaks: true });
  return DOMPurify.sanitize(html);
}

// The note's text without Markdown syntax, for list previews.
export function markdownExcerpt(text: string, length = 140): string {
  const plain = text
    .replace(FRONT_MATTER, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\[[ xX]\]\s+/gm, '')
    .replace(/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/gm, ' ')
    .replace(/[*_`~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > length ? `${plain.slice(0, length).trimEnd()}…` : plain;
}

export function wordCount(text: string): number {
  return text.replace(FRONT_MATTER, '').match(/\S+/g)?.length ?? 0;
}
