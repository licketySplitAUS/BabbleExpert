'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { explain } = require('../../src/dice-rules');

test('reference dice conflicts cover shared rare letters, repeated V and bare Q across word lengths', () => {
  for (const word of ['baby', 'bike', 'book', 'jazz', 'quiz', 'ququ', 'squeezebox']) assert.match(explain(word), /share one reference die/, word);
  for (const word of ['qaid', 'qats', 'suqs']) assert.match(explain(word), /accompanying U/, word);
  assert.match(explain('viva'), /Not enough V dice/);
  assert.match(explain('vulva'), /Not enough V dice/);
  for (const word of ['quit', 'queue', 'mugg', 'bravo', 'orchards', 'CHARLIE']) assert.equal(explain(word), '', word);
});

test('distinct-dice matching detects combined shortages, without rejecting feasible reassignment', () => {
  assert.match(explain('vwww'), /too few distinct dice/);
  assert.match(explain('ccccwww'), /too few distinct dice/);
  assert.equal(explain('ccccww'), '');
  for (const raw of ['', null, 'a-bb', 'bb', 'aaaaaaaaaaaaa']) assert.equal(explain(raw), '');
});
