'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clueLabel, parseDefinitions, createDefinitionLookup } = require('../../src/create-clues');

test('clue labels use the real prefix, length and Babble letter values including Qu', () => {
  assert.equal(clueLabel('rees'), 're4,4 :');
  assert.equal(clueLabel('rattan'), 'ra6,18 :');
  assert.equal(clueLabel('quit'), 'qu4,7 :');
  assert.equal(clueLabel('quits'), 'qu5,16 :');
  assert.equal(clueLabel('storax'), 'st6,33 :');
  assert.equal(clueLabel('jazz'), 'ja4,19 :');
  assert.equal(clueLabel('exam'), 'ex4,10 :');
});
test('definitions are exact-word matches, stripped of part of speech and do not reveal the answer', () => {
  assert.deepEqual(parseDefinitions('rees', [
    { word: 'reel', defs: ['n\tan unrelated word'] },
    { word: 'rees', defs: ['n\ta walled enclosure for livestock', 'n\ta walled enclosure for livestock', 'n\tRees: another meaning', null] }
  ]), ['a walled enclosure for livestock', '…: another meaning']);
  assert.deepEqual(parseDefinitions('rees', [{ word: 'reel', defs: ['n\tNot the same word'] }]), []);
});
test('definition lookups cache and deduplicate requests, while Try again can refresh', async () => {
  let calls = 0, release;
  const lookup = createDefinitionLookup({ fetchImpl: async url => {
    calls++; assert.equal(url, 'https://api.datamuse.com/words?sp=rees&md=d');
    if (calls === 1) await new Promise(resolve => { release = resolve; });
    return { ok: true, json: async () => [{ word: 'rees', defs: ['n\ta walled enclosure for livestock'] }] };
  } });
  const first = lookup.lookup('rees'), second = lookup.lookup('rees');
  release(); assert.deepEqual(await first, await second);
  await lookup.lookup('rees'); assert.equal(calls, 1);
  await lookup.lookup('rees', { refresh: true }); assert.equal(calls, 2);
  await assert.rejects(lookup.lookup('re*s'), /completed Babble word/);
});

test('long definitions retain their complete ending and remain distinct after 220 characters', () => {
  const start = 'A network topology with multiple computers individually merging to one central switch. '.repeat(6);
  const definitions = [`${start}The complete first ending.`, `${start}The complete second ending.`];
  assert.deepEqual(parseDefinitions('star', [{ word: 'star', defs: definitions.map(def => 'n\t' + def) }]), definitions);
});
test('failed lookups remain retryable and missing definitions are not fabricated', async () => {
  let calls = 0;
  const lookup = createDefinitionLookup({ fetchImpl: async () => {
    if (++calls === 1) throw new Error('offline');
    return { ok: true, json: async () => [{ word: 'rees' }] };
  } });
  await assert.rejects(lookup.lookup('rees'), /Try again/);
  assert.deepEqual(await lookup.lookup('rees'), []);
  assert.equal(calls, 2);
});
