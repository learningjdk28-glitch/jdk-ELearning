// Splits the small Markdown subset used by lesson files into blocks. Pure: no HTML is ever produced.
export function parseBlocks(markdown) {
  const blocks = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: 'ul', items: list });
    list = null;
  };
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (/^###\s+/.test(line)) {
      flushPara();
      flushList();
      blocks.push({ type: 'h3', text: line.replace(/^###\s+/, '') });
    } else if (/^-\s+/.test(line)) {
      flushPara();
      (list ||= []).push(line.replace(/^-\s+/, ''));
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}
