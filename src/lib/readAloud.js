import { parseBlocks } from './markdownBlocks.js';
import { parseSteps } from './pageVersions.js';

/** Removes the Markdown marks a voice should not say (**bold**, [text](url)). */
export const speakable = (text) => text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();

/** The parts of a page read aloud, in order: the title, then each heading, paragraph, list item or step. */
export function readAloudParts(title, kind, content) {
  const parts = [speakable(title || '')];
  if (kind === 'video' || kind === 'link') {
    parts.push(kind === 'video' ? 'This page is a video. Use the button to watch it.' : 'This page links to a resource. Use the button to open it.');
  } else if (kind === 'steps') {
    parseSteps(content || '').forEach((s, i) => parts.push(`Step ${i + 1}. ${speakable(s.t)}${s.d ? `. ${speakable(s.d)}` : ''}`));
  } else {
    for (const b of parseBlocks(content || '')) {
      if (b.type === 'ul') b.items.forEach((item) => parts.push(speakable(item)));
      else parts.push(speakable(b.text));
    }
  }
  return parts.filter(Boolean);
}
