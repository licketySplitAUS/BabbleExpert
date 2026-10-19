'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createReleaseNotes } = require('../../src/release-notes');
const pkg = require('../../package.json');
test('installed release notes are packaged and readable offline', async () => {
  let calls = 0;
  const notes = createReleaseNotes({ fetchImpl: async () => { calls++; throw Error('offline'); } });
  const bundled = await notes.get();
  assert.equal(bundled.installedVersion, pkg.version);
  assert.match(bundled.entries.find(row => row.version === pkg.version).body, /STORAX.*st6,33/);
  assert.ok(bundled.entries.some(row => row.version === '3.2.8'));
  assert.equal(calls, 0);
  const offline = await notes.get({ online: true });
  assert.match(offline.message, /Included notes/);
  assert.deepEqual(offline.entries, bundled.entries);
});
test('recent notes filter nonreleases, cache requests, preserve bundled installed notes and refresh explicitly', async () => {
  let calls = 0;
  const notes = createReleaseNotes({ fetchImpl: async () => { calls++; return { ok: true, json: async () => [
    { tag_name: 'v9.9.9', body: '**New feature**', published_at: '2026-10-19T00:00:00Z' },
    { tag_name: 'v3.2.9', body: 'Do not replace the offline installed notes' },
    { tag_name: 'v99.0.0', draft: true, body: 'draft' }, { tag_name: 'v98.0.0', prerelease: true }, { tag_name: 'untrusted-tag' },
  ] }; } });
  const first = await notes.get({ online: true });
  assert.equal(first.entries[0].version, '9.9.9');
  assert.equal(first.entries[0].date, '2026-10-19');
  assert.ok(first.entries.every(row => !['99.0.0', '98.0.0', 'untrusted-tag'].includes(row.version)));
  assert.match(first.entries.find(row => row.version === pkg.version).body, /st6,33/);
  await notes.get({ online: true }); assert.equal(calls, 1);
  await notes.get({ online: true, refresh: true }); assert.equal(calls, 2);
});
