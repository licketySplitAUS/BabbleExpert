'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cluesTemplate, resourcesTemplate } = require('../../src/menus');
const resources = require('../../src/resources');

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

test("resources menu has Lickety's 4 through 12 letter word lists", () => {
  const opened = [];
  const menu = resourcesTemplate({ resources, cheat: false, open: r => opened.push(r), hide: () => {} });
  assert.equal(menu.some(item => item.label === 'A to Z Word Finder'), false);
  const heading = menu.findIndex(item => item.label === 'All Lickety Words');
  assert.equal(menu[heading].enabled, false);
  assert.deepEqual(menu.slice(heading + 1, heading + 10).map(item => item.label.trim()), Array.from({ length: 9 }, (_, i) => `${i + 4} Letter Words`));
  menu[heading + 1].click();
  assert.match(opened[0].url, /words-4\.html\?v=2$/);
  assert.equal(opened[0].width, 90);
  assert.equal(opened[0].external, false);
  assert.equal(opened[0].showTitle, false);
});
