'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { makeFireworksOverlayScript } = require('../../src/fireworks-overlay');

test('fireworks injection refuses a lookalike host before touching the page', () => {
  const code = makeFireworksOverlayScript(['playbabble.com']);
  assert.doesNotThrow(() => new Function(code));
  assert.equal(vm.runInNewContext(code, { location: { hostname: 'playbabble.com.evil.test' } }), false);
});

test('the hidden logo gesture requires five clicks inside a rolling one-second window', () => {
  let now = 0, click, previews = 0, prevented = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/preload-puzzle.js'), 'utf8'), {
    require: () => ({ ipcRenderer: { on() {}, invoke: async () => false, send: name => { assert.equal(name, 'celebration:preview'); previews++; } } }),
    document: { addEventListener: (name, handler) => { if (name === 'click') click = handler; } },
    performance: { now: () => now }, URL, location: { href: 'https://r46.me/babbleclues.html' }
  });
  const press = (time, filename = 'MyLogo.gif') => {
    now = time;
    click({ target: { closest: () => ({ src: 'https://r46.me/' + filename }) }, preventDefault: () => { prevented++; } });
  };
  for(let i=0;i<8;i++)press(i*30, 'unrelated.gif');
  assert.equal(previews + prevented, 0);
  for(let i=0;i<4;i++)press(500+i*100);
  assert.equal(previews, 0);
  press(1900);
  assert.equal(previews, 0, 'clicks from the previous second have expired');
  for(let i=1;i<5;i++)press(1900+i*100);
  assert.equal(previews, 1);
  for(let i=0;i<5;i++)press(3000+i*250, 'MyLogo.jpg');
  assert.equal(previews, 2, 'the JPG logo variant works too');
});
