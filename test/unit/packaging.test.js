'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { displayVersion } = require('../../src/version');

test('packaged package metadata can omit electron-builder configuration', () => {
  assert.equal(displayVersion({ version: '3.1.1' }), '3.1.1.0');
  assert.equal(displayVersion({ version: '3.1.1', build: { buildVersion: '3.1.1.42' } }), '3.1.1.42');
});

test('outdated tour is unreachable and its player and videos are excluded from installers', () => {
  const root = path.join(__dirname, '..', '..');
  const pkg = require('../../package.json');
  for (const pattern of ['!src/tour/**/*', '!src/tour.js', '!src/preload-tour.js']) assert.ok(pkg.build.files.includes(pattern));
  for (const file of ['src/app.js', 'src/menus.js', 'src/preload-help.js', 'src/ui/help.html', 'src/ui/help.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /createTourController|watchTour|watch-tour|Watch guided tour|tour:open/);
  }
});

test('desktop experiment and local info pages are packaged with Babble Expert', () => {
  for (const name of ['fun-word-play.html', 'chill-vibes.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'experiments', name), 'utf8');
    assert.match(html, /BabbleExpertInteract/);
    assert.doesNotMatch(html, /DeviceMotionEvent|deviceorientation|getUserMedia|wakeLock/);
    for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(match[1]));
  }
  const fun = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'experiments', 'fun-word-play.html'), 'utf8');
  assert.doesNotMatch(fun, /id="(?:live|entry|save)"/);
  const chill = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'experiments', 'chill-vibes.html'), 'utf8');
  assert.doesNotMatch(chill, /id="(?:title|preview|word)"|Çhill/);
  const info = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'experiments', 'lickety-info.html'), 'utf8');
  assert.match(info, /Voice Canvas/);
  assert.match(info, /Protoplasm/);
});
