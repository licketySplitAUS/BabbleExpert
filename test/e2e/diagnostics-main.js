'use strict';
// Real embedded-page failure through the app and diagnostic sender to a local
// receiver. Never contact the public reporting service or Discord in this test.
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const { createDiagnostics } = require('../../src/diagnostics');
for (const method of ['show', 'focus', 'maximize']) BrowserWindow.prototype[method] = function () {};
app.disableHardwareAcceleration();
app.on('web-contents-created', (_event, wc) => wc.setBackgroundThrottling(false));
const dir = fs.mkdtempSync(path.join(process.cwd(), 'diagnostic-profile-'));
app.setPath('userData', dir);
const deadline = setTimeout(() => { console.error('FAIL diagnostic integration timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const reports = [];
  let disconnectBabble = false;
  const server = http.createServer((request, response) => {
    if (request.url === '/diagnostics') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => { reports.push(JSON.parse(body)); response.writeHead(204); response.end(); });
      return;
    }
    if (disconnectBabble && request.url.startsWith('/babble')) { request.socket.destroy(); return; }
    response.setHeader('content-type', 'text/html');
    response.end(fs.readFileSync(path.join(__dirname, 'fixtures', request.url.startsWith('/babble') ? 'babble.html' : 'clues.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const diagnostics = createDiagnostics({ userDataDir: dir, version: '3.2.11.0', endpoint: base + '/diagnostics' });
  const ctx = createApp({ userDataDir: dir, diagnostics, telemetryEndpoint: null, telemetryPrompt: false, tourPrompt: false,
    urls: { babble: base + '/babble', clues: base + '/clues' }, hosts: { babble: ['127.0.0.1'], clues: ['127.0.0.1'] } });
  await new Promise(resolve => ctx.win.webContents.once('did-finish-load', resolve));
  ctx.patch({ usageSharing: true });
  const failed = new Promise(resolve => ctx.views.clues.webContents.once('did-fail-load', (_event, code) => resolve(code)));
  // Port 1 is rejected by Chromium, exercising a real did-fail-load event.
  await ctx.views.clues.webContents.loadURL('http://127.0.0.1:1/private-diagnostic-test').catch(() => {});
  await failed;
  await diagnostics.flush();
  const failure = reports.find(report => report.event === 'load-failed' && report.component === 'clues');
  assert.ok(failure, 'real page failure sent');
  assert.ok(Number.isInteger(failure.code));
  assert.equal(failure.anonymousId, ctx.settings.data.anonymousId);
  assert.doesNotMatch(JSON.stringify(reports), /private-diagnostic-test|127\.0\.0\.1|Users/);
  console.log('PASS real Clues loading failure reports an error code and anonymous installation ID without the URL');
  const babble = ctx.views.babble.webContents;
  disconnectBabble = true;
  const interrupted = new Promise(resolve => babble.once('did-fail-load', (_event, code) => resolve(code)));
  void ctx.refreshBabble();
  assert.equal(await interrupted, -324);
  disconnectBabble = false;
  // Chromium can finish its built-in error document with the failed URL still
  // visible. Wait for Expert's retry navigation before accepting completion.
  await new Promise(resolve => {
    const started = (_event, url) => {
      if (url !== base + '/babble') return;
      babble.removeListener('did-start-navigation', started); resolve();
    };
    babble.on('did-start-navigation', started);
  });
  const recovered = new Promise(resolve => {
    const loaded = () => {
      if (babble.getURL() !== base + '/babble') return;
      babble.removeListener('did-finish-load', loaded); resolve();
    };
    babble.on('did-finish-load', loaded);
  });
  await recovered;
  const state = await ctx.win.webContents.executeJavaScript('be.getState()');
  assert.equal(state.paneHealth.babble, 'ready');
  assert.equal(await babble.executeJavaScript('!!document.getElementById("word_list")'), true);
  console.log('PASS a real interrupted Babble request quietly retries and restores a usable puzzle');
  disconnectBabble = true;
  let failures = 0;
  await new Promise(resolve => {
    const failedLoad = () => {
      if (++failures !== 3) return;
      babble.removeListener('did-fail-load', failedLoad); resolve();
    };
    babble.on('did-fail-load', failedLoad);
    void ctx.refreshBabble();
  });
  // Let the friendly fallback finish loading; it must remain a failed pane,
  // rather than enable transfers just because its local HTML loaded.
  await new Promise(resolve => setTimeout(resolve, 200));
  const exhausted = await ctx.win.webContents.executeJavaScript('be.getState()');
  assert.equal(exhausted.paneHealth.babble, 'failed');
  assert.equal(exhausted.canSend, false);
  assert.match(await babble.executeJavaScript('document.body.innerText'), /Refresh or Retry/);
  assert.doesNotMatch(await babble.executeJavaScript('document.body.innerText'), /ERR_EMPTY_RESPONSE/);
  console.log('PASS two failed retries leave a gentle refresh suggestion and keep transfers disabled');
  ctx.patch({ usageSharing: false });
  const before = reports.length;
  ctx.views.babble.webContents.emit('unresponsive');
  await diagnostics.flush();
  assert.equal(reports.length, before);
  console.log('PASS disabling anonymous sharing immediately stops diagnostics');
  clearTimeout(deadline);
  server.close();
  console.log('ALL DIAGNOSTICS INTEGRATION CHECKS PASSED');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
