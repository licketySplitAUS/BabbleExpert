'use strict';

const versionKey = value => typeof value === 'string' ? (value.trim().match(/^v?(\d+\.\d+\.\d+)(?:\.\d+)?$/i)?.[1] || '') : '';
function plainText(value) {
  return value.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
}
function shortLine(value) {
  const text = plainText(value);
  if (text.length <= 130) return text;
  const cut = text.slice(0, 127), space = cut.lastIndexOf(' ');
  return cut.slice(0, space > 85 ? space : 127).replace(/[,:;.!?]+$/, '') + '…';
}
function releaseHighlights(notes, version) {
  if (Array.isArray(notes)) {
    const wanted = versionKey(version);
    notes = wanted ? notes.slice(0, 32).find(item => versionKey(item?.version) === wanted)?.note : null;
  }
  if (typeof notes !== 'string') return [];
  // electron-updater supplies GitHub feed HTML; Mac's API supplies Markdown.
  // Both become bounded plain text, never executable markup or external links.
  const source = notes.slice(0, 50000).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<h[1-6]\b[^>]*>/gi, '\n## ').replace(/<\/h[1-6]\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/(?:li|p|ul|ol)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^<>]{0,2048}>/g, '').replace(/&(?:amp|nbsp|quot|apos|lt|gt|rsquo|lsquo|hellip);/gi, entity => ({
      '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&rsquo;': '’', '&lsquo;': '‘', '&hellip;': '…'
    })[entity.toLowerCase()]).replace(/&#(x[\da-f]+|\d+);/gi, (_entity, code) => {
      const number = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
    });
  const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const target = versionKey(version);
  // Prefer an explicitly edited short section, then the release's What's New.
  const heading = /^(?:#{1,6}\s*)?(?:update highlights|what['’]?s new)\b/i;
  let start = lines.findIndex(line => /^(?:#{1,6}\s*)?update highlights\b/i.test(line));
  if (start === -1) start = lines.findIndex(line => heading.test(line));
  const scoped = start !== -1;
  if (scoped) {
    const namedVersion = lines[start].match(/\bv?(\d+\.\d+\.\d+(?:\.\d+)?)\b/i)?.[1];
    if (target && namedVersion && versionKey(namedVersion) !== target) return [];
  }
  const result = [];
  for (let index = scoped ? start + 1 : 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^#{1,6}\s|^(?:downloads?(?: and updates)?|installation|system requirements)\s*:?$/i.test(line)) break;
    const bullet = line.match(/^(?:[-*•]|\d+\.)\s+(.+)/);
    if (bullet) {
      const text = shortLine(bullet[1]);
      if (text && !result.includes(text)) result.push(text);
      if (result.length === 3) break;
    }
  }
  if (!result.length && !scoped && !lines.some(line => /^#/.test(line))) {
    const first = shortLine(lines[0] || ''); if (first) result.push(first);
  }
  return result;
}
function updatePrompt({ version, releaseNotes, platform = 'win32' }) {
  const versionText = versionKey(version), highlights = releaseHighlights(releaseNotes, version);
  const intro = highlights.length ? "What's new\n" + highlights.map(text => '• ' + text).join('\n') + '\n\n' : '';
  const instructions = platform === 'darwin'
    ? 'Download the DMG, open it, then replace Babble Expert in Applications. Your settings and journal are kept.'
    : 'Update now: saves your settings and journal, installs and reopens Expert. Please wait for it to reopen.\n\nLater: keep playing. Installs silently when you close Expert, without reopening.';
  return {
    type: 'info', title: 'Babble Expert Update',
    message: `${versionText ? 'Babble Expert ' + versionText : 'A Babble Expert update'} is ${platform === 'darwin' ? 'available' : 'ready to install'}`,
    detail: intro + instructions,
    buttons: platform === 'darwin' ? ['Download DMG', 'Later'] : ['Update now', 'Later'],
    defaultId: platform === 'darwin' ? 0 : 1, cancelId: 1, noLink: true
  };
}
module.exports = { releaseHighlights, updatePrompt };
