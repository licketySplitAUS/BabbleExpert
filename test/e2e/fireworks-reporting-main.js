'use strict';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
for (const method of ['show', 'showInactive', 'focus', 'maximize']) BrowserWindow.prototype[method] = function () {};
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'be-fireworks-reports-')));
const { createApp } = require('../../src/app');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async fn => { for (let i = 0; i < 150; i++) { try { if (await fn()) return; } catch {} await sleep(50); } throw Error('Fireworks report timed out'); };
setTimeout(() => { console.error('Fireworks reporting test timed out'); app.exit(1); }, 30000).unref();
app.whenReady().then(async () => {
  const sent = [];
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(fs.readFileSync(path.join(__dirname, 'fixtures', req.url.startsWith('/babble') ? 'babble.html' : 'clues.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://localhost:' + server.address().port;
  const ctx = createApp({ userDataDir: app.getPath('userData'), version: '3.3.0.0', telemetryPrompt: false, tourPrompt: false,
    telemetryEndpoint: base+'/notify', telemetryFetch: async (_url, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; },
    urls: { babble: base+'/babble', clues: base+'/clues' }, hosts: { babble: ['localhost'], clues: ['localhost'] }, tickMs: 100, pace: 0 });
  const reports = () => sent.filter(row => /^Fireworks/.test(row.item || ''));
  try {
    await until(() => ctx.engine.state.ready && ctx.engine.state.cluesOk);
    ctx.patch({ usageSharing: true });
    await ctx.views.babble.webContents.executeJavaScript("document.getElementById('total_words_left').textContent='0'");
    await ctx.engine.tick();
    await until(() => reports().length === 1);
    assert.equal(reports()[0].item, 'Fireworks');
    assert.equal(reports()[0].event, 'option');
    await until(async () => await ctx.views.babble.webContents.executeJavaScript("!!document.getElementById('babble-expert-fireworks')") && await ctx.views.clues.webContents.executeJavaScript("!!document.getElementById('babble-expert-fireworks')"));
    const url = ctx.views.res.webContents.getURL();
    ctx.views.res.webContents.emit('did-navigate-in-page', {}, url, true);
    ctx.views.res.webContents.emit('did-navigate-in-page', {}, url, false);
    ctx.views.res.webContents.emit('did-navigate-in-page', {}, base+'/#fireworks=fake', true);
    await sleep(100); assert.equal(reports().length, 1, 'Three panes and repeated/foreign navigation cannot duplicate the report');
    await ctx.views.res.webContents.executeJavaScript("document.getElementById('sky').click()");
    await until(() => reports().length === 2); assert.equal(reports()[1].item, 'Fireworks replay');
    assert.doesNotMatch(JSON.stringify(reports()), /puzzleId|gridLetters|words|remaining|durationSeconds/);
    ctx.hideResources(); ctx.patch({ usageSharing: false });
    await ctx.views.babble.webContents.executeJavaScript("document.getElementById('total_words_left').textContent='1'"); await ctx.engine.tick();
    await ctx.views.babble.webContents.executeJavaScript("document.getElementById('total_words_left').textContent='0'"); await ctx.engine.tick();
    await until(() => ctx.views.res.webContents.getURL().includes('fireworks='));
    await sleep(150); assert.equal(reports().length, 2, 'Opted-out automatic fireworks remain unreported');
    console.log('PASS: automatic completion sends one Expert report for three panes; replay sends one; duplicate and foreign signals are ignored; opt-out suppresses reports; no puzzle data is included.');
  } finally { server.close(); }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
