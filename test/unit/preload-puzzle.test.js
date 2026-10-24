'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Grab Grid reports human activations and ignores automatic scripted clicks', () => {
  const listeners = [], sent = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/preload-puzzle.js'), 'utf8'), {
    require: () => ({ ipcRenderer: { send: (...args) => sent.push(args), on() {}, invoke: async () => false } }),
    document: { activeElement: null, addEventListener: (name, callback) => { if (name === 'click') listeners.push(callback); } },
    setTimeout: callback => callback()
  });
  function click(isTrusted, grab = true) {
    const event = { isTrusted, target: { closest: selector => grab && selector === 'button.grabgrid:not(:disabled)' ? {} : null } };
    listeners.forEach(callback => callback(event));
  }
  click(false); click(true, false);
  assert.deepEqual(sent, []);
  click(true);
  assert.deepEqual(sent, [['clues:grab-grid']]);
});

test('N, P and right-click navigate only when enabled and no field is being edited', () => {
  const listeners = new Map(), subscriptions = new Map(), sent = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/preload-puzzle.js'), 'utf8'), {
    require: () => ({ ipcRenderer: { send: (...args) => sent.push(args), on: (channel, callback) => subscriptions.set(channel, callback), invoke: async () => false } }),
    document: { activeElement: null, addEventListener: (name, callback) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); } },
  });
  const fire = (type, overrides = {}) => {
    const event = { key: 'n', target: { closest: () => null }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {}, ...overrides };
    for (const callback of listeners.get(type) || []) callback(event);
    return event.prevented;
  };
  fire('keydown'); assert.deepEqual(sent, []);
  subscriptions.get('clues:navigation-enabled')({}, true);
  for (const key of ['n', 'p']) for (const overrides of [{ target: { closest: () => ({}) } }, { repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) assert.equal(fire('keydown', { key, ...overrides }), undefined);
  assert.equal(fire('contextmenu', { target: { closest: () => ({}) } }), undefined);
  assert.equal(fire('contextmenu', { shiftKey: true }), undefined);
  assert.deepEqual(sent, []);
  assert.equal(fire('keydown'), true); assert.equal(fire('contextmenu'), true);
  assert.deepEqual(sent, [['clues:next'], ['clues:next']]);
  assert.equal(fire('keydown', { key: 'p' }), true);
  assert.deepEqual(sent[2], ['clues:previous']);
});
