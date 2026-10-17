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
