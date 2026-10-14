// Markdown essenziale e sicuro: tutto viene prima convertito in testo,
// poi si aggiungono solo i tag previsti. Nessun HTML esterno passa.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMarkdown(md) {
  let html = '';
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) html += `<p>${para.map(inline).join('<br>')}</p>`;
    para = [];
  };
  const flushList = () => {
    if (list) html += `</${list}>`;
    list = null;
  };
  const openList = (tag) => {
    if (list !== tag) {
      flushList();
      html += `<${tag}>`;
      list = tag;
    }
  };
  for (const raw of String(md).replace(/\r/g, '').split('\n')) {
    const line = esc(raw.trimEnd());
    let m;
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) {
      flushPara();
      flushList();
      html += `<h3>${inline(m[1])}</h3>`;
    } else if ((m = line.match(/^\s*&gt;\s?(.*)$/))) {
      flushPara();
      flushList();
      html += `<blockquote>${inline(m[1])}</blockquote>`;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushPara();
      flushList();
      html += '<hr>';
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      flushPara();
      openList('ul');
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      openList('ol');
      html += `<li>${inline(m[1])}</li>`;
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return html;
}
