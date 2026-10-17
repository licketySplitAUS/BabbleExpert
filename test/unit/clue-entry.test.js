'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readClueEntry } = require('../../src/clue-entry');

function field(name, label, value, checked = false, key = '') {
  const row = { cells: [{ textContent: label }], querySelector: () => ({ checked }) };
  return { name, value, closest: () => row, getAttribute: () => key };
}
test('legacy clue lookup uses the nearest correctly solved rows on either side', () => {
  const fields = [field('edt1', 'ra4,5', 'rats', true), field('edt2', 'ra6,18', 'ra'), field('edt3', 'ra6,18', 'ratter', true)];
  assert.deepEqual(readClueEntry({ querySelectorAll: () => fields }, { name: 'edt2' }, ['rats', 'ratter']),
    { prefix: 'ra', length: 6, lower: 'rats', upper: 'ratter' });
  assert.equal(readClueEntry({ querySelectorAll: () => fields }, { name: 'edt1' }, ['rats', 'ratter']), null);
});
test('Self Serve Off view uses hidden solved neighbours without returning the answer key', () => {
  const target = field('', 'ra6,18', 'ra', false, 'RATTEN');
  const context = readClueEntry({ querySelectorAll: () => [target] }, { answerKey: 'RATTEN' }, ['rats', 'ratter', 'ramus', 'ratters']);
  assert.deepEqual(context, { prefix: 'ra', length: 6, lower: 'rats', upper: 'ratter' });
  assert.ok(!JSON.stringify(context).includes('ratten'));
});
test('unbounded clues work and malformed or missing entries are ignored', () => {
  const target = field('edt1', 're5,10', 're');
  assert.deepEqual(readClueEntry({ querySelectorAll: () => [target] }, { name: 'edt1' }, []),
    { prefix: 're', length: 5, lower: '', upper: '' });
  assert.equal(readClueEntry({ querySelectorAll: () => [target] }, { name: 'edt999' }, []), null);
  assert.equal(readClueEntry({ querySelectorAll: () => [field('edt1', 'invalid', 're')] }, { name: 'edt1' }, []), null);
});
