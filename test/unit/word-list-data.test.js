'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createWordListData, parseWordList, sourceURL } = require('../../src/word-list-data');
const { lowerBound, prefixIndex, clueIndex, visibleRange } = require('../../src/word-list-index');
const url = 'https://licketysplitaus.github.io/Babble/words-5.html?v=6';
const html = '<script>throw Error("not executed")</script><div class="w">alpha</div><div class="w">bravo</div><div class="w">delta</div>';
test('word data parser accepts only sorted, distinct words of the requested length', () => {
  assert.deepEqual(parseWordList(html, 5), ['alpha', 'bravo', 'delta']);
  for (const body of ['', '<div class="w">abcd</div>', '<div class="w">bravo</div><div class="w">alpha</div>', '<div class="w">alpha</div><div class="w">alpha</div>', '<div class="w">&copy;</div>', 'x'.repeat(2097153)]) assert.throws(() => parseWordList(body, 5));
  for (const source of ['http://licketysplitaus.github.io/Babble/words-5.html', 'https://evil.example/words-5.html', 'https://licketysplitaus.github.io/Other/words-5.html', 'https://x:y@licketysplitaus.github.io/Babble/words-5.html', 'https://licketysplitaus.github.io/Babble/words-4.html', 'http://localhost/words-5.html']) assert.throws(() => sourceURL(source, 5, false));
  assert.match(sourceURL('http://127.0.0.1:123/words-5.html', 5, true), /127/);
});
test('validated data caches across opens and restarts; failed refresh retains the good list', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-words-data-'));
  let now = 1000000000, calls = 0;
  const make = fetchImpl => createWordListData({ cacheDir, now: () => now, fetchImpl });
  const data = make(async (_url, options) => { calls++; assert.equal(options.redirect, 'error'); return new Response(html); });
  const first = await data.load(url, 5); assert.equal(first.cached, false);
  assert.equal((await data.load(url, 5)).cached, true); assert.equal(calls, 1);
  const offline = make(async () => { throw Error('offline'); });
  assert.equal((await offline.load(url, 5)).stale, false, 'A fresh on-disk cache needs no network');
  now += 86400001;
  assert.equal((await offline.load(url, 5)).stale, true);
  assert.deepEqual((await offline.load(url, 5, { refresh: true })).words, first.words);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cacheDir, 'words-5.json'), 'utf8')).words, first.words);
  assert.equal((await make(async () => new Response('broken')).load(url, 5)).stale, true);
  await assert.rejects(offline.load(url.replace('5.html', '6.html'), 6), /Could not load/);
});
test('concurrent loads share a request, oversized input is bounded, and failures remain retryable', async () => {
  let resolve, calls = 0;
  const data = createWordListData({ fetchImpl: async () => { calls++; return new Promise(done => { resolve = done; }); } });
  const a = data.load(url, 5), b = data.load(url, 5); resolve(new Response(html));
  assert.deepEqual((await a).words, (await b).words); assert.equal(calls, 1);
  let fail = true;
  const retry = createWordListData({ fetchImpl: async () => fail ? new Response(html, { headers: { 'content-length': '3000000' } }) : new Response(html) });
  await assert.rejects(retry.load(url, 5), /Could not load/); fail = false;
  assert.equal((await retry.load(url, 5)).words.length, 3);
});

test('expired words open immediately during a shared refresh; only the next open sees new words', async () => {
  let now = 1000000000, calls = 0, release;
  const data = createWordListData({ now: () => now, fetchImpl: async () => {
    calls++;
    return calls === 1 ? new Response(html) : new Promise(resolve => { release = resolve; });
  } });
  const first = await data.load(url, 5); now += 86400001;
  const cached = await data.load(url, 5);
  assert.equal(cached.stale, true); assert.deepEqual(cached.words, first.words);
  assert.deepEqual((await data.load(url, 5)).words, first.words); assert.equal(calls, 2);
  const refresh = data.load(url, 5, { refresh: true });
  release(new Response('<div class="w">alpha</div><div class="w">delta</div>'));
  assert.deepEqual((await refresh).words, ['alpha', 'delta']);
  assert.deepEqual(cached.words, ['alpha', 'bravo', 'delta'], 'The displayed snapshot stays stable');
  assert.deepEqual((await data.load(url, 5)).words, ['alpha', 'delta']); assert.equal(calls, 2);
});
test('indexed positioning honors solved-word bounds and keeps the visible window bounded', () => {
  const words = ['rattan', 'ratten', 'ratter', 'rattle', 'rattly'];
  assert.equal(lowerBound(words, 'rattb'), 1); assert.equal(prefixIndex(words, 'ratta'), 0);
  assert.equal(prefixIndex(words, 'rattles', true), 3); assert.equal(prefixIndex(words, 'z'), -1);
  assert.equal(clueIndex(words, { prefix: 'ra', length: 6, lower: 'rats', upper: 'ratter' }), 0);
  assert.equal(clueIndex(words, { prefix: 'ra', length: 6, lower: 'rattan', upper: 'ratten' }), -1);
  assert.equal(clueIndex(words, { prefix: 'ra', length: 5 }), -1);
  for (const scroll of [0, 16000, 450000, 999999999]) {
    const range = visibleRange(28514, scroll, 700);
    assert.ok(range.start >= 0 && range.end <= 28514 && range.end - range.start < 75);
  }
});
