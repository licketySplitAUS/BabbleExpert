'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cluesTemplate } = require('../../src/menus');

test('clues menu shows the current source and selects the other source', () => {
  const selected = [];
  const menu = cluesTemplate('lickety', source => selected.push(source));
  assert.deepEqual(menu.map(item => [item.label, item.checked]), [
    ["Lickety's Clues", true],
    ['Self Serve Clues', false]
  ]);
  menu[1].click();
  assert.deepEqual(selected, ['selfServe']);
});
