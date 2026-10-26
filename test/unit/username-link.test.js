'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { cleanUsername, usernameReportFields } = require('../../src/username-link');
const { Settings } = require('../../src/settings');
const { createTelemetry } = require('../../src/telemetry');
const { createLicketyMessenger } = require('../../src/lickety-message');
const { createDiagnostics } = require('../../src/diagnostics');
const id = 'BE-ABCD-EFGH', since = '2026-10-26T00:00:00Z';
const link = { username: 'Babble Player', consentVersion: 1, since };

test('username linking is off by default, validated, persistent and removable without enabling reports', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-username-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.json'), settings = new Settings(file);
  assert.equal(settings.data.usernameLink, null);
  for (const bad of [{ ...link, consentVersion: 0 }, { ...link, username: '' }, { ...link, username: '@everyone' }, { ...link, since: 'bad' }]) {
    settings.patch({ usernameLink: bad }); assert.equal(settings.data.usernameLink, null);
  }
  settings.patch({ usernameLink: link }); settings.flush();
  const restored = new Settings(file);
  assert.deepEqual(restored.data.usernameLink, link); assert.equal(restored.data.usageSharing, null);
  restored.patch({ usernameLink: null }); restored.flush();
  assert.equal(new Settings(file).data.usernameLink, null);
  assert.equal(cleanUsername('<script>'), '');
});

test('only explicit message checkbox consent sends the username and trusted installation ID', async () => {
  const sent = [];
  const messenger = createLicketyMessenger({ anonymousId: id, version: '3.3.0', fetchImpl: async (_, options) => { sent.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ usernameLinked: true }) }; } });
  await messenger.send({ message: 'Hello', babbleUsername: 'PrivateName', anonymousId: 'spoofed' });
  assert.deepEqual(sent[0], { message: 'Hello', version: '3.3.0' });
  assert.equal((await messenger.send({ message: 'Hello', rememberUsername: true, babbleUsername: '' })).ok, false);
  assert.equal((await messenger.send({ message: 'Hello', rememberUsername: true, babbleUsername: ' Babble Player ', anonymousId: 'spoofed' })).usernameLinked, true);
  assert.deepEqual(sent[1], { message: 'Hello', version: '3.3.0', anonymousId: id, usernameSharingVersion: 1, babbleUsername: 'Babble Player' });
});

test('an older server accepting the message cannot silently create a username link', async () => {
  const messenger = createLicketyMessenger({ anonymousId: id, fetchImpl: async () => ({ ok: true }) });
  const result = await messenger.send({ message: 'Hello', rememberUsername: true, babbleUsername: 'Player' });
  assert.equal(result.ok, true); assert.equal(result.usernameLinked, false);
});

test('username reporting requires both permissions, ignores injected details, and stops after unlinking', async () => {
  let enabled = false, current = link; const sent = [];
  const telemetry = createTelemetry({ endpoint: 'https://example.test', enabled: () => enabled, getUsernameLink: () => current, anonymousId: id,
    fetchImpl: async (_, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; } });
  await telemetry.send('option', { babbleUsername: 'injected' }); assert.equal(sent.length, 0);
  enabled = true; await telemetry.send('option', { babbleUsername: 'injected' });
  assert.equal(sent[0].babbleUsername, 'Babble Player');
  current = null; await telemetry.send('option', { babbleUsername: 'injected' });
  assert.equal(sent[1].babbleUsername, undefined); assert.equal(sent[1].usernameSharingVersion, 1);
  assert.deepEqual(usernameReportFields(link, Date.parse(since) - 1), { usernameSharingVersion: 1 });
});

test('queued diagnostics never gain a later username link and unlinking removes it before delivery', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-username-diag-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sent = [], consent = { usageSharing: true, anonymousId: id, usernameLink: link };
  const config = { userDataDir: dir, version: '3.3.0', getConsent: () => consent, now: () => Date.parse(since) + 1000 };
  const queued = createDiagnostics({ ...config, fetchImpl: async () => { throw Error('offline'); } });
  queued.report('load-failed', { component: 'clues', code: -105 }); await queued.flush();
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'pending-diagnostics.json'), 'utf8'), /Babble Player/);
  consent.usernameLink = null;
  const resumed = createDiagnostics({ ...config, fetchImpl: async (_, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; } });
  await resumed.flush(); assert.equal(sent[0].babbleUsername, undefined);
  consent.usernameLink = { ...link, since: new Date(Date.parse(since) + 5000).toISOString() };
  assert.deepEqual(usernameReportFields(consent.usernameLink, Date.parse(since) + 1000), { usernameSharingVersion: 1 });
});
