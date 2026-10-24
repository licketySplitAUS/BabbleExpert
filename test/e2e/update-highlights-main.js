'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
for (const method of ['show', 'showInactive', 'focus', 'maximize']) BrowserWindow.prototype[method] = function () {};
const focused = [];
BrowserWindow.prototype.focus = function () { focused.push(this); };
app.disableHardwareAcceleration();
const arg = key => process.argv.find(value => value.startsWith(`--highlights-${key}=`))?.split('=').slice(1).join('=');
const stage = arg('stage'), profile = arg('profile');
assert.ok(stage && profile && path.basename(profile).startsWith('be-highlights-restarts-'));
app.setPath('userData', profile); app.on('web-contents-created', (_event, wc) => wc.setBackgroundThrottling(false));
const { createApp } = require('../../src/app');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 150; i++) { try { if (await fn()) return; } catch {} await sleep(40); } throw Error(`Highlights test timed out at ${stage}`); }
setTimeout(() => { console.error('Highlights test deadline'); app.exit(1); }, 30000).unref();
app.whenReady().then(async () => {
  const version = ['first-install', 'downgrade'].includes(stage) ? '9.0.0.0' : stage === 'next-update' ? '9.0.2.0' : '9.0.1.0';
  let requests = 0;
  const ctx = createApp({ userDataDir: profile, version, updateHighlightsEnabled: stage !== 'development',
    tourPrompt: false, telemetryPrompt: false, telemetryEndpoint: null,
    releaseNotesFetch: async () => { requests++; throw Error('offline'); },
    urls: { babble: 'about:blank', clues: 'about:blank' } });
  const main = code => ctx.win.webContents.executeJavaScript(code);
  const owner = () => ctx.getHighlightsWindow();
  const run = code => owner().webContents.executeJavaScript(code);
  await until(() => main("!!document.getElementById('btnOpt').onclick"));
  const shouldOpen = ['upgrade-close', 'upgrade-ok', 'next-update'].includes(stage);
  if (shouldOpen) {
    await until(() => owner() && !owner().webContents.isLoading());
    await until(() => run("!document.getElementById('ok').disabled"));
    assert.equal(await run("document.querySelectorAll('#features article').length"), 4);
    assert.match(await run("document.getElementById('edition').textContent"), new RegExp(version.slice(0, -2)));
    assert.equal(requests, 0, 'Automatic highlights never need network access');
    assert.equal(ctx.settings.data.acknowledgedUpdateVersion, stage === 'next-update' ? '9.0.1' : null);
    if (stage === 'upgrade-close') {
      owner().close(); await until(() => !owner()); await sleep(120);
      assert.equal(owner(), null, 'Closing cannot reopen the window repeatedly in this session');
      assert.equal(ctx.settings.data.pendingUpdateVersion, '9.0.1');
    } else {
      const hostile = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '../../src/preload-highlights.js'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
      await hostile.loadURL('data:text/html,<body>Untrusted page</body>');
      assert.equal(await hostile.webContents.executeJavaScript('updateHighlights.get()'), null);
      assert.equal(await hostile.webContents.executeJavaScript('updateHighlights.acknowledge()'), false);
      assert.equal(await hostile.webContents.executeJavaScript('updateHighlights.releaseNotes()'), false);
      assert.equal(ctx.settings.data.pendingUpdateVersion, version.slice(0, -2)); hostile.destroy();
      if (stage === 'upgrade-ok') {
        const shots = path.join(__dirname, '../../artifacts/update-highlights'); fs.mkdirSync(shots, { recursive: true });
        await sleep(100); fs.writeFileSync(path.join(shots, 'desktop.png'), (await owner().webContents.capturePage()).toPNG());
        owner().setSize(390, 420); await sleep(100);
        assert.ok(await run("document.documentElement.scrollWidth<=innerWidth && document.getElementById('ok').getBoundingClientRect().bottom<=innerHeight"));
        assert.ok(await run("document.getElementById('content').scrollHeight>document.getElementById('content').clientHeight"));
        fs.writeFileSync(path.join(shots, 'narrow.png'), (await owner().webContents.capturePage()).toPNG());
        await run("document.getElementById('notes').click()");
        await until(() => BrowserWindow.getAllWindows().some(win => win.getTitle() === 'Babble Expert Help'));
        const help = BrowserWindow.getAllWindows().find(win => win.getTitle() === 'Babble Expert Help');
        await until(() => help.webContents.executeJavaScript("!document.getElementById('release-notes').hidden"));
        assert.equal(ctx.settings.data.acknowledgedUpdateVersion, null, 'Reading full notes does not silently acknowledge');
        focused.length = 0;
        await help.webContents.executeJavaScript("document.getElementById('closeHelp').click()");
        await until(() => help.isDestroyed() && focused.at(-1) === owner());
        assert.ok(focused.includes(ctx.win), 'Closing Help raises the main app before returning to What’s new');
      }
      focused.length = 0;
      await run("document.getElementById('ok').click()"); await until(() => !owner());
      await until(() => focused.at(-1) === ctx.win);
      assert.equal(ctx.win.isDestroyed(), false, 'Acknowledgement returns to the existing puzzle window');
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
      assert.equal(saved.acknowledgedUpdateVersion, version.slice(0, -2)); assert.equal(saved.pendingUpdateVersion, null);
    }
  } else {
    await sleep(200); assert.equal(owner(), null, `${stage} must not auto-open highlights`);
    if (['development', 'acknowledged'].includes(stage)) {
      await main("be.action('showHighlights')");
      await until(() => owner() && !owner().webContents.isLoading());
      await until(() => run("!document.getElementById('ok').disabled"));
      if (stage === 'development') assert.match(await run("document.getElementById('edition').textContent"), /PREVIEW/);
      await run("document.getElementById('ok').click()"); await until(() => !owner());
      await until(() => focused.at(-1) === ctx.win);
      if (stage === 'development') {
        assert.equal(ctx.settings.data.acknowledgedUpdateVersion, null);
        assert.equal(ctx.settings.data.pendingUpdateVersion, '9.0.1', 'Preview does not consume the installed update notice');
      }
      if (stage === 'acknowledged') {
        await main("be.action('showHighlights')"); await until(() => owner() && !owner().webContents.isLoading());
        await ctx.prepareForUpdate(); focused.length = 0;
        owner().close(); await sleep(80);
        assert.equal(focused.length, 0, 'Shutdown must not raise Expert again when a helper closes');
      }
    }
  }
  assert.equal(ctx.settings.data.usageSharing, null, 'Acknowledgement does not enable usage sharing');
  console.log(`PASS highlights: ${stage}`); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
