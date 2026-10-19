'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cluesTemplate, resourcesTemplate, optionsTemplate } = require('../../src/menus');
const resources = require('../../src/resources');
const { DEFAULTS } = require('../../src/settings');

test('Zoom menu steps up and down, resets, and disables the limits', () => {
  const patches = [];
  const menu = zoom => optionsTemplate({ ...DEFAULTS, zoom }, p => patches.push(p)).find(item => item.label?.startsWith('Zoom (')).submenu;
  menu(100)[0].click(); menu(100)[1].click(); menu(175)[2].click();
  assert.deepEqual(patches, [{ zoom: 110 }, { zoom: 90 }, { zoom: 100 }]);
  assert.equal(menu(75)[1].enabled, false);
  assert.equal(menu(200)[0].enabled, false);
});

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

test('Options opens both desktop word-play experiments in the resource pane', () => {
  const opened = [], experiments = { funWordPlay: { url: 'file:///fun.html' }, chillVibes: { url: 'file:///chill.html' } };
  const tracked = [];
  const settings = { yellow: false, switchSides: false, hideHints: false, highlightEntry: true, usageSharing: true, add: { noChat: false, speed: 3, fontSize: '20pt', thin: false } };
  const menu = optionsTemplate(settings, () => {}, { open: item => opened.push(item.url), experiments, track: item => tracked.push(item) });
  const fun = menu.find(item => item.label === 'Fun Word Play');
  const chill = menu.find(item => item.label === 'Chill Vibes');
  assert.equal(fun.enabled, true); assert.equal(chill.enabled, true);
  fun.click(); chill.click();
  assert.deepEqual(opened, ['file:///fun.html', 'file:///chill.html']);
  menu.find(item => item.label === 'Yellow Theme').click({ checked: true });
  assert.deepEqual(tracked, ['Yellow Theme on']);
  assert.equal(menu.find(item => item.label === 'Highlight entry on grid').checked, true);
  assert.equal(optionsTemplate(DEFAULTS, () => {}).find(item => item.label === 'Create Clues - click on your found word').checked, true);
  assert.equal(optionsTemplate({ ...DEFAULTS, createClues: false }, () => {}).find(item => item.label === 'Create Clues - click on your found word').checked, false);
  assert.equal(menu.find(item => item.label === 'Share anonymous usage notifications').checked, true);
});

test("resources menu has Lickety's 4 through 12 letter word lists", () => {
  const opened = [];
  const menu = resourcesTemplate({ resources, cheat: false, open: r => opened.push(r), hide: () => {} });
  assert.equal(menu.some(item => item.label === 'A to Z Word Finder'), false);
  assert.equal(menu.some(item => item.label === 'Icon Themes'), false);
  const heading = menu.findIndex(item => item.label === 'All Lickety Words');
  assert.equal(menu[heading].enabled, false);
  assert.deepEqual(menu.slice(heading + 1, heading + 10).map(item => item.label.trim()), Array.from({ length: 9 }, (_, i) => `${i + 4} Letter Words`));
  menu[heading + 1].click();
  assert.match(opened[0].url, /words-4\.html\?v=6$/);
  assert.equal(opened[0].width, 90);
  assert.equal(opened[0].external, false);
  assert.equal(opened[0].showTitle, false);
  assert.equal(opened[0].submitWords, true);
});

test('Options provides an explicit Send lickety a message action',()=>{
 let opened=0;optionsTemplate(DEFAULTS,()=>{},{messageLickety:()=>opened++}).find(item=>item.label==='Send lickety a message').click();assert.equal(opened,1);
});
