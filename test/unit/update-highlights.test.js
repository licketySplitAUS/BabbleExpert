'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Settings } = require('../../src/settings');
const { createUpdateHighlights, releaseVersion, validateHighlights } = require('../../src/update-highlights');
const { recordLaunchVersion } = require('../../src/updates');
const setup = (saved = {}) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'be-highlights-')), 'settings.json');
  const settings = new Settings(file); settings.patch(saved); settings.flush();
  return { file, settings };
};

test('upgrade highlights stay pending across launches until OK, independently of sharing', () => {
  const { file, settings } = setup({ lastRunVersion: '3.2.11.0', usageSharing: false });
  const first = createUpdateHighlights({ settings, version: '3.2.12.0', enabled: true });
  assert.equal(first.pending(), true); assert.equal(first.view().version, '3.2.12');
  assert.equal(first.view().preview, false); recordLaunchVersion(settings, '3.2.12.0');
  const restartedSettings = new Settings(file);
  const resumed = createUpdateHighlights({ settings: restartedSettings, version: '3.2.12', enabled: true });
  assert.equal(resumed.pending(), true, 'Displaying or closing the window is not acknowledgement');
  assert.equal(resumed.acknowledge(), true); assert.equal(resumed.pending(), false);
  const acknowledged = new Settings(file);
  assert.equal(acknowledged.data.acknowledgedUpdateVersion, '3.2.12'); assert.equal(acknowledged.data.pendingUpdateVersion, null);
  assert.equal(createUpdateHighlights({ settings: acknowledged, version: '3.2.12.0', enabled: true }).pending(), false);
  assert.equal(acknowledged.data.usageSharing, false);
});

test('first installs, same versions, unknown versions and downgrades do not open update highlights', () => {
  for (const [saved, version] of [[{}, '3.2.12'], [{ lastRunVersion: '3.2.12.0' }, '3.2.12'],
    [{ lastRunVersion: '3.3.0' }, '3.2.12'], [{ lastRunVersion: '3.2.11' }, 'invalid']]) {
    const { settings } = setup(saved);
    const notice = createUpdateHighlights({ settings, version, enabled: true });
    assert.equal(notice.pending(), false); assert.equal(notice.acknowledge(), false);
  }
});

test('old telemetry version can identify an upgrade; later versions get a new acknowledgement', () => {
  const { settings } = setup({ telemetryVersion: '3.1.0.0', acknowledgedUpdateVersion: '3.2.11' });
  const notice = createUpdateHighlights({ settings, version: '3.2.12', enabled: true });
  assert.equal(notice.pending(), true); notice.acknowledge();
  recordLaunchVersion(settings, '3.2.12');
  assert.equal(createUpdateHighlights({ settings, version: '3.3.0', enabled: true }).pending(), true);
});

test('downgrading and re-upgrading cannot repeat an acknowledged version or clear a future notice', () => {
  const { settings } = setup({ lastRunVersion: '3.2.11', acknowledgedUpdateVersion: '3.2.12', pendingUpdateVersion: '3.3.0' });
  const previous = createUpdateHighlights({ settings, version: '3.2.12', enabled: true });
  assert.equal(previous.pending(), false); assert.equal(previous.acknowledge(), false);
  assert.equal(settings.data.pendingUpdateVersion, '3.3.0');
  assert.equal(createUpdateHighlights({ settings, version: '3.3.0', enabled: true }).pending(), true);
});

test('development previews never queue or acknowledge an installed update', () => {
  const { file, settings } = setup({ lastRunVersion: '3.2.11', pendingUpdateVersion: '3.2.12' });
  const before = fs.readFileSync(file, 'utf8');
  const notice = createUpdateHighlights({ settings, version: '3.2.12', enabled: false });
  assert.equal(notice.pending(), false); assert.equal(notice.view().preview, true);
  assert.equal(notice.acknowledge(), false); assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('a failed settings write preserves the pending notice and permits an acknowledgement retry', () => {
  const { settings } = setup({ lastRunVersion: '3.2.11' });
  const notice = createUpdateHighlights({ settings, version: '3.2.12', enabled: true });
  const flush = settings.flush.bind(settings); settings.flush = () => false;
  assert.equal(notice.acknowledge(), false); assert.equal(notice.pending(), true);
  assert.equal(settings.data.acknowledgedUpdateVersion, null);
  settings.flush = flush;
  assert.equal(notice.acknowledge(), true); assert.equal(notice.pending(), false);
});

test('highlight content is curated, bounded and isolated from renderer mutations', () => {
  const { settings } = setup();
  const notice = createUpdateHighlights({ settings, version: '3.2.12' });
  assert.ok(notice.view().items.length <= 8);
  assert.doesNotMatch(JSON.stringify(notice.view().items), /Electron|checksum|Netlify|Discord statistics|bot token/);
  const data = notice.view(); data.items[0].title = 'changed';
  assert.notEqual(notice.view().items[0].title, 'changed');
  for (const items of [[], [{ title: 'Empty' }], [{ title: 'x'.repeat(81), body: 'text' }]]) assert.throws(() => validateHighlights(items));
  assert.equal(releaseVersion('3.2.12.0'), '3.2.12'); assert.equal(releaseVersion('invalid'), '');
  settings.patch({ pendingUpdateVersion: '<bad>', acknowledgedUpdateVersion: 3 });
  assert.equal(settings.data.pendingUpdateVersion, null); assert.equal(settings.data.acknowledgedUpdateVersion, null);
});
