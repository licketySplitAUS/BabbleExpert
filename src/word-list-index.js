'use strict';
// Shared pure positioning maths: no DOM walks, network access or puzzle state.
(function (root) {
  const lowerBound = (words, value) => {
    let low = 0, high = words.length;
    while (low < high) { const mid = (low + high) >>> 1; if (words[mid] < value) low = mid + 1; else high = mid; }
    return low;
  };
  function prefixIndex(words, raw, fallback = false) {
    const prefix = String(raw || '').toLowerCase().replace(/[^a-z]/g, '');
    for (let size = prefix.length; size > 0; size = fallback ? size - 1 : 0) {
      const part = prefix.slice(0, size), index = lowerBound(words, part);
      if (words[index]?.startsWith(part)) return index;
    }
    return fallback && words.length ? 0 : -1;
  }
  function clueIndex(words, { prefix, length, lower, upper }) {
    if (typeof prefix !== 'string' || !/^[a-z]{1,12}$/.test(prefix)) return -1;
    let index = Math.max(lowerBound(words, prefix), lower ? lowerBound(words, lower) : 0);
    for (; index < words.length && words[index].startsWith(prefix); index++) {
      const word = words[index];
      if (upper && word >= upper) break;
      if (word.length === length && (!lower || word > lower)) return index;
    }
    return -1;
  }
  function visibleRange(count, scroll, height, rowHeight = 16, top = 26, buffer = 12) {
    const first = Math.min(Math.max(0, count - 1), Math.max(0, Math.floor((scroll - top) / rowHeight)));
    const start = Math.max(0, first - buffer);
    return { start, end: Math.min(count, first + Math.ceil(height / rowHeight) + buffer + 1) };
  }
  const api = { lowerBound, prefixIndex, clueIndex, visibleRange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BabbleWordIndex = api;
})(typeof window === 'undefined' ? globalThis : window);
