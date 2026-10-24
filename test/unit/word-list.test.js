'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWordListResults } = require('../../src/word-list');
const puzzle = { ready: true, puzzleId: '8097', gridLetters: 'BRAVOALPHADELTACHARLIEXXX' };

test('word-list results survive length switches and retain the last result per word', () => {
  const results = createWordListResults();
  results.setPuzzle(puzzle);
  results.record({ word: 'bravo', color: 'green' });
  results.record({ word: 'aback', color: 'red' });
  results.record({ word: 'charlie', color: 'green' });
  assert.equal(results.forLength(5).length, 2);
  assert.equal(results.forLength(7)[0].word, 'charlie');
  results.record({ word: 'bravo', color: 'amber' });
  assert.equal(results.forLength(5).find(row => row.word === 'bravo').color, 'amber');
  assert.equal(results.setPuzzle({ ...puzzle }), false);
  assert.equal(results.forLength(5).length, 2);
});

test('saved or externally entered Babble words seed amber without overwriting new green results', () => {
  const results = createWordListResults();
  results.setPuzzle(puzzle);
  results.record({ word: 'bravo', color: 'green', message: 'Added to Babble: bravo' });
  results.record({ word: 'delta', color: 'red' });
  assert.deepEqual(results.found(['ALPHA', 'bravo', 'delta']).map(row => row.word), ['alpha', 'delta']);
  assert.equal(results.forLength(5).find(row => row.word === 'bravo').color, 'green');
  assert.match(results.forLength(5).find(row => row.word === 'alpha').message, /Already entered/);
  assert.deepEqual(results.found(['alpha', 'bravo', 'delta']), [], 'Unchanged snapshots require no renderer updates');
});

test('a new puzzle clears results while temporary loading preserves the current puzzle', () => {
  const results = createWordListResults();
  results.setPuzzle(puzzle);
  results.record({ word: 'bravo', color: 'green' });
  assert.equal(results.setPuzzle({ ready: false, puzzleId: '', gridLetters: '' }), false);
  assert.equal(results.forLength(5).length, 1);
  assert.equal(results.setPuzzle({ ...puzzle, puzzleId: '8098' }), true);
  assert.deepEqual(results.forLength(5), []);
  results.record({ word: 'bravo', color: 'green' });
  assert.equal(results.setPuzzle({ ...puzzle, puzzleId: '8098', gridLetters: 'A'.repeat(25) }), true);
  assert.deepEqual(results.forLength(5), []);
  for (const data of [{ word: 'hello there', color: 'green' }, { word: 'cat', color: 'red' }, { word: 'bravo', color: 'pending' }]) assert.equal(results.record(data), null);
});
