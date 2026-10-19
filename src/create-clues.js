'use strict';

const LETTER_VALUES = { a: 1, b: 3, c: 2, d: 2, e: 1, f: 4, g: 3, h: 2, i: 1, j: 8, k: 5, l: 1, m: 2,
  n: 1, o: 1, p: 2, q: 5, r: 1, s: 1, t: 1, u: 2, v: 4, w: 5, x: 8, y: 3, z: 10 };

function clueLabel(word) {
  let points = 0;
  for (let i = 0; i < word.length; i++) {
    points += LETTER_VALUES[word[i]] || 0;
    if (word[i] === 'q' && word[i + 1] === 'u') i++;
  }
  return `${word.slice(0, 2)}${word.length},${points * (word.length - 3)} :`;
}

function parseDefinitions(word, results) {
  const exact = Array.isArray(results) && results.find(item => String(item?.word || '').toLowerCase() === word);
  if (!exact || !Array.isArray(exact.defs)) return [];
  return [...new Set(exact.defs.filter(def => typeof def === 'string').map(def => def.replace(/^[^\t]*\t/, '')
    .replace(/\s+/g, ' ').trim().replace(new RegExp(`\\b${word}\\b`, 'gi'), '…')).filter(Boolean))];
}

function createDefinitionLookup({ fetchImpl = globalThis.fetch } = {}) {
  const cache = new Map(), pending = new Map();
  async function lookup(word, { refresh = false } = {}) {
    if (!/^[a-z]{4,25}$/.test(word)) throw new Error('Choose a completed Babble word.');
    if (!refresh && cache.has(word)) return cache.get(word);
    if (pending.has(word)) return pending.get(word);
    const task = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6500);
      timer.unref?.();
      try {
        const response = await fetchImpl(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d`, { signal: controller.signal });
        if (!response.ok) throw new Error('Definition lookup failed. Try again.');
        const definitions = parseDefinitions(word, await response.json());
        if (cache.size >= 256) cache.delete(cache.keys().next().value);
        cache.set(word, definitions);
        return definitions;
      } catch (error) {
        throw new Error(error.name === 'AbortError' ? 'Definition lookup timed out. Try again.' : 'Could not load a definition. Try again.');
      } finally { clearTimeout(timer); }
    })();
    pending.set(word, task);
    try { return await task; } finally { pending.delete(word); }
  }
  return { lookup };
}

module.exports = { clueLabel, parseDefinitions, createDefinitionLookup };
