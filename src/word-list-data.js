'use strict';
const fs = require('node:fs');
const path = require('node:path');
const MAX_BYTES = 2 * 1024 * 1024, MAX_WORDS = 100000, TTL = 24 * 60 * 60 * 1000;

function validateWords(words, length) {
  if (!Number.isInteger(length) || length < 4 || length > 12 || !Array.isArray(words) || !words.length || words.length > MAX_WORDS) throw new Error('Word list is unavailable.');
  let previous = '';
  for (const word of words) {
    if (typeof word !== 'string' || word.length !== length || !/^[a-z]+$/.test(word) || word <= previous) throw new Error('Word list is not in the expected format.');
    previous = word;
  }
  return words;
}
function parseWordList(html, length) {
  if (typeof html !== 'string' || Buffer.byteLength(html) > MAX_BYTES) throw new Error('Word list is too large.');
  const words = [...html.matchAll(/<div\s+class=["']w["']\s*>([^<]*)<\/div>/g)].map(match => match[1].trim());
  return validateWords(words, length);
}
function sourceURL(raw, length, allowLocal) {
  const url = new URL(raw);
  const production = url.protocol === 'https:' && url.hostname === 'licketysplitaus.github.io' && url.pathname === `/Babble/words-${length}.html`;
  const local = allowLocal && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol) && url.pathname === `/words-${length}.html`;
  if ((!production && !local) || url.username || url.password || url.hash) throw new Error('This word-list source is not allowed.');
  return url.href;
}
async function boundedText(response) {
  if (Number(response.headers?.get('content-length')) > MAX_BYTES) throw new Error('Word list is too large.');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('Word list is too large.');
    return text;
  }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Word list is too large.'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
}
function createWordListData({ cacheDir, fetchImpl = globalThis.fetch, now = Date.now, allowLocal = false } = {}) {
  const memory = new Map(), pending = new Map();
  const fileFor = length => cacheDir && path.join(cacheDir, `words-${length}.json`);
  function saved(source, length) {
    if (memory.has(source)) return memory.get(source);
    try {
      const file = fileFor(length);
      if (!file || fs.statSync(file).size > MAX_BYTES) return null;
      const item = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (item.source !== source || !Number.isFinite(item.fetchedAt) || item.fetchedAt > now() + 60000) return null;
      validateWords(item.words, length); memory.set(source, item); return item;
    } catch { return null; }
  }
  async function load(raw, length, { refresh = false } = {}) {
    const source = sourceURL(raw, length, allowLocal), previous = saved(source, length);
    if (!refresh && previous && now() - previous.fetchedAt < TTL) return { ...previous, cached: true, stale: false };
    if (pending.has(source)) return previous && !refresh ? { ...previous, cached: true, stale: true } : pending.get(source);
    const task = (async () => {
      try {
        const response = await fetchImpl(source, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Accept: 'text/html' } });
        if (!response.ok) throw new Error('Word list could not be downloaded.');
        const item = { source, fetchedAt: now(), words: parseWordList(await boundedText(response), length) };
        if (memory.size >= 12) memory.delete(memory.keys().next().value);
        memory.set(source, item);
        const file = fileFor(length);
        if (file) {
          try { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(item), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); }
          catch { /* A cache failure must not prevent use of a valid list. */ }
        }
        return { ...item, cached: false, stale: false };
      } catch (error) {
        if (previous) return { ...previous, cached: true, stale: true };
        throw new Error('Could not load the words. Check your connection, then choose Retry.');
      } finally { pending.delete(source); }
    })();
    pending.set(source, task);
    // A saved list remains immediately usable while its daily refresh runs.
    // Never replace words under the player's pointer; a later opening uses
    // the refreshed data. Explicit Retry waits for the refresh result.
    return previous && !refresh ? { ...previous, cached: true, stale: true } : task;
  }
  return { load };
}
module.exports = { createWordListData, validateWords, parseWordList, sourceURL };
