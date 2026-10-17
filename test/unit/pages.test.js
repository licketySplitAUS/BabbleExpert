'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makePages } = require('../../src/pages');

// Fake webContents that records what would be run and returns what we tell it to.
function fakeWc(url, { loading = false, result = undefined, destroyed = false } = {}) {
  const wc = { ran: [], getURL: () => url, isLoading: () => loading, isDestroyed: () => destroyed, executeJavaScript: async code => { wc.ran.push(code); return typeof result === 'function' ? result(code) : result; } };
  return wc;
}
const mk = (b, c) => makePages({ getBabble: () => b, getClues: () => c, babbleHosts: ['playbabble.com', 'www.playbabble.com'], cluesHosts: ['r46.me', 'selfserve.r46.me'] });

test('scripts only run on the expected websites', async () => {
  const evil = fakeWc('https://evil.example/x'); const clues = fakeWc('https://r46.me/babbleclues.html', { result: true });
  const p = mk(evil, clues);
  await assert.rejects(p.babble.state(), /expected website/);
  await assert.rejects(p.babble.addWord('x'), /expected website/);
  await assert.rejects(p.babble.fireworks('void 0'), /expected website/);
  assert.equal(evil.ran.length, 0);
  assert.equal(await p.clues.ping(), true);
  await assert.rejects(mk(null, fakeWc('https://evil.example/')).clues.fireworks('void 0'), /expected website/);
});

test('host check is exact: lookalike hosts are refused', async () => {
  for (const u of ['https://playbabble.com.evil.io/', 'https://notplaybabble.com/', 'about:blank', 'file:///x'])
    await assert.rejects(mk(fakeWc(u), fakeWc('https://r46.me/')).babble.words(), /expected website/);
});

test('page still loading / destroyed / missing are errors, not hangs', async () => {
  await assert.rejects(mk(fakeWc('https://playbabble.com/', { loading: true }), null).babble.state(), /still loading/);
  await assert.rejects(mk(fakeWc('https://playbabble.com/', { destroyed: true }), null).babble.state(), /not available/);
  await assert.rejects(mk(null, null).babble.state(), /not available/);
});

test('words and arguments are passed as data, never spliced in as code', async () => {
  const wc = fakeWc('https://playbabble.com/', { result: '' }); const p = mk(wc, null);
  const nasty = `x');alert(1);//"\\`;
  await p.babble.addWord(nasty); await p.babble.addChat('line1\nline2 "q" \u2028');
  const code = wc.ran.join('\n');
  assert.ok(code.includes(JSON.stringify(nasty)));
  for (const c of wc.ran) assert.doesNotThrow(() => new Function(c), 'generated script must be valid JavaScript');
});

test('clues: only the three known functions can be called; GetAllWords is split into lines', async () => {
  const wc = fakeWc('https://r46.me/babbleclues.html', { result: 'alpha\nbravo\n' }); const p = mk(null, wc);
  assert.deepEqual(await p.clues.getAllWords(), ['alpha', 'bravo']);
  const { CLUES_FUNCTIONS } = require('../../src/pages'); assert.deepEqual(CLUES_FUNCTIONS, ['GetAllWords', 'AddBabbleWord', 'showAll']);
});

test('Self Serve exposes the same guarded Clues API', async () => {
  const wc = fakeWc('https://selfserve.r46.me/', { result: 'alpha\nbravo\n' }); const p = mk(null, wc);
  assert.deepEqual(await p.clues.getAllWords(), ['alpha', 'bravo']);
  assert.equal(wc.ran.length, 1);
});
