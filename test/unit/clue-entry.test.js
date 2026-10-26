'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readClueEntry, nextClueEntry, completedClueEntry } = require('../../src/clue-entry');

function field(name, label, value, checked = false, key = '') {
  const row = { cells: [{ textContent: label }], querySelector: () => ({ checked }) };
  return { name, value, closest: () => row, getAttribute: () => key };
}

test('automatic advancement requires Off mode and completion of the selected clue', () => {
  for (const off of [false, true]) {
    const fields = [field('edt1', 'ra4,5', 'rats', true)];
    const document = { querySelectorAll: selector => selector.includes('rdbShow') ? [{}, {}, { checked: off }] : fields };
    assert.equal(completedClueEntry(document, { name: 'edt1' }, ['rats']), off);
    assert.equal(completedClueEntry(document, { name: 'edt2' }, ['rats']), false);
    assert.equal(completedClueEntry(document, { answerKey: 'RATS' }, ['rats']), off, 'A removed React row can still be identified');
    assert.equal(completedClueEntry(document, { answerKey: 'REACH' }, ['rats']), false);
    assert.equal(completedClueEntry(document, null, ['rats']), false);
  }
});
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

test('next clue skips completed and unsupported rows, then wraps', () => {
  const fields = [field('edt1', 'ra4,5', 'rats', true), field('edt2', 'ra6,18', 'ra'), field('edt3', 'ra6,18', 'ratter', true),
    field('edt4', 're5,10', 're'), field('edt5', 'st13,80', 'st')];
  const document = { querySelectorAll: () => fields };
  assert.equal(nextClueEntry(document).identity.name, 'edt2');
  assert.deepEqual(nextClueEntry(document, { name: 'edt2' }), { identity: { name: 'edt4', answerKey: '' }, wrapped: false });
  assert.deepEqual(nextClueEntry(document, { name: 'edt4' }), { identity: { name: 'edt2', answerKey: '' }, wrapped: true });
  assert.deepEqual(nextClueEntry(document, { name: 'edt4' }, -1), { identity: { name: 'edt2', answerKey: '' }, wrapped: false });
  assert.deepEqual(nextClueEntry(document, { name: 'edt2' }, -1), { identity: { name: 'edt4', answerKey: '' }, wrapped: true });
  assert.equal(nextClueEntry(document, null, -1).identity.name, 'edt4');
});

test('next clue continues after a solved row disappears in Self Serve Off view', () => {
  const document = { querySelectorAll: () => [field('', 'aa4,4', 'aa', false, 'AAHS'), field('', 're5,10', 're', false, 'REACH')] };
  assert.deepEqual(nextClueEntry(document, { answerKey: 'RATTAN' }), { identity: { name: '', answerKey: 'REACH' }, wrapped: false });
  assert.equal(nextClueEntry(document, { answerKey: 'ZZZZ' }).wrapped, true);
  assert.deepEqual(nextClueEntry(document, { answerKey: 'RATTAN' }, -1), { identity: { name: '', answerKey: 'AAHS' }, wrapped: false });
  assert.equal(nextClueEntry(document, { answerKey: 'AAAA' }, -1).identity.answerKey, 'REACH');
});

test('next clue handles completed, hidden and disabled fields without selecting an answer', () => {
  const hidden = field('edt2', 'ra6,18', 'ra'); hidden.getClientRects = () => [];
  const disabled = field('edt3', 're5,10', 're'); disabled.disabled = true;
  const document = { querySelectorAll: () => [field('edt1', 'ra4,5', 'rats', true), hidden, disabled] };
  assert.equal(nextClueEntry(document), null);
});
