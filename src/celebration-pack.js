'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Script } = require('node:vm');
const { createHash } = require('node:crypto');
const SOURCE = 'https://selfserve.r46.me/celebration-pack-v1.json';
const MAX_BYTES = 512 * 1024, TTL = 6 * 60 * 60 * 1000, RETRY = 5 * 60 * 1000;
const effectID = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(value);

function validatePack(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BYTES) throw Error('Celebration pack too large');
  const pack = JSON.parse(raw);
  if (pack.version !== 1 || !Array.isArray(pack.effects) || !pack.effects.length || pack.effects.length > 100 ||
      !pack.effects.every(effectID) || new Set(pack.effects).size !== pack.effects.length ||
      !Array.isArray(pack.labels) || pack.labels.length !== pack.effects.length ||
      !pack.labels.every(label => typeof label === 'string' && label.length > 0 && label.length <= 80)) throw Error('Incompatible celebration pack');
  for (const [key, name] of [['renderer', 'createBabbleCelebration'], ['fireworks', 'createBabbleFireworks']]) {
    if (typeof pack[key] !== 'string' || !pack[key].startsWith(`function ${name}(`)) throw Error('Invalid celebration renderer');
    // Compile only: downloaded JavaScript must never execute in the main process.
    new Script('(' + pack[key] + '\n)');
  }
  return Object.freeze({ ...pack, id: createHash('sha256').update(raw).digest('hex') });
}

function bundledPack() {
  return { id: 'bundled', deliverySource: 'bundled', renderer: require('./experiments/celebrations').createBabbleCelebration.toString(),
    fireworks: require('./experiments/fireworks').createBabbleFireworks.toString() };
}

async function boundedText(response) {
  if (Number(response.headers?.get('content-length')) > MAX_BYTES) throw Error('Celebration pack too large');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw Error('Celebration pack too large'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
}

function createCelebrationPacks({ cacheDir, fetchImpl = globalThis.fetch, now = Date.now, report = () => {} } = {}) {
  let current, pending, checkedAt = -Infinity, loaded = false, failures = 0;
  const file = cacheDir && path.join(cacheDir, 'celebration-pack-v1.json');
  function saved() {
    if (loaded) return;
    loaded = true;
    try { if (file && fs.statSync(file).size <= MAX_BYTES) current = { ...validatePack(fs.readFileSync(file, 'utf8')), deliverySource: 'cached' }; } catch { /* Use the packaged shows. */ }
  }
  async function load() {
    saved();
    if (pending) return current || pending;
    if (now() - checkedAt < (current && !failures ? TTL : RETRY)) return current || bundledPack();
    if (!pending) pending = (async () => {
      checkedAt = now();
      let received = false;
      try {
        const response = await fetchImpl(SOURCE, { redirect: 'error', signal: AbortSignal.timeout(2500), headers: { Accept: 'application/json' } });
        if (!response.ok || (response.url && response.url !== SOURCE)) throw Error('Celebration download failed');
        received = true;
        const raw = await boundedText(response), pack = validatePack(raw);
        current = { ...pack, deliverySource: 'downloaded' }; failures = 0;
        try {
          if (file) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file + '.tmp', raw, { mode: 0o600 }); fs.renameSync(file + '.tmp', file); }
        } catch { /* A full disk must not interrupt the show. */ }
      } catch {
        // Retain a usable show and retry quietly. Report only persistent trouble.
        if (++failures === 2) report('celebration-pack-failed', { component: 'resources', code: received ? 'ERR_CELEBRATION_PACK_REJECTED' : 'ERR_CELEBRATION_DOWNLOAD_FAILED' });
      }
      finally { pending = null; }
      return current || bundledPack();
    })();
    // Cached shows start immediately; a refresh applies to the next opening.
    return current || pending;
  }
  return { load };
}
module.exports = { createCelebrationPacks, validatePack, bundledPack, effectID, SOURCE, MAX_BYTES };
