'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
for (const method of ['show', 'showInactive', 'focus', 'maximize']) BrowserWindow.prototype[method] = function () {};
app.disableHardwareAcceleration();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'be-resource-loading-profile-'));
app.setPath('userData', profile); app.on('web-contents-created', (_event, wc) => wc.setBackgroundThrottling(false));
const { createApp } = require('../../src/app'), resources = require('../../src/resources');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 160; i++) { try { if (await fn()) return; } catch {} await sleep(50); } throw Error('Timed out waiting for resource progress'); }
setTimeout(() => { console.error('Resource progress test timed out'); app.exit(1); }, 40000).unref();
app.whenReady().then(async () => {
  const source = process.env.WORD_LIST_DIR; assert.ok(source);
  let releaseDocument, documentResponse, assets = 0, requests = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/slow.png') { assets++; return res.end(); }
    res.setHeader('content-type', 'text/html');
    if (/^\/words-\d+\.html$/.test(url.pathname)) {
      requests++;
      if (url.searchParams.has('fail')) return res.destroy();
      const html = fs.readFileSync(path.join(source, url.pathname.slice(1)), 'utf8') + '<img src="/slow.png"><script>window.hostedScriptExecuted=true</script>';
      if (url.pathname === '/words-7.html') { documentResponse = res; releaseDocument = () => res.end(html); }
      else res.end(html);
      return;
    }
    res.end(fs.readFileSync(path.join(__dirname, 'fixtures', url.pathname === '/babble.html' ? 'babble.html' : 'clues.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${server.address().port}`;
  const ctx = createApp({ tourPrompt: false, telemetryPrompt: false, telemetryEndpoint: null, userDataDir: profile,
    urls: { babble: base + '/babble.html', clues: base + '/clues.html' }, hosts: { babble: ['localhost'], clues: ['localhost'] }, pace: 0 });
  const ui = code => ctx.win.webContents.executeJavaScript(code), run = code => ctx.views.res.webContents.mainFrame.executeJavaScript(code);
  const open = (length, query = '') => ctx.openResource({ ...resources.find(item => item.wordLength === length), url: `${base}/words-${length}.html${query}` });
  const ready = length => until(async () => new URL(ctx.views.res.webContents.getURL()).searchParams.get('length') === String(length) && ctx.views.res.getVisible() && await ui("document.getElementById('resLoading').hidden"));
  try {
    await until(() => ctx.engine.state.ready && ctx.engine.state.puzzleMatch === true);
    open(4); await ready(4);
    await ctx.views.clues.webContents.executeJavaScript(`document.body.insertAdjacentHTML('beforeend','<table><tr><td>ch7,40</td><td><input type="checkbox"><input name="edt900" value="ch"></td></tr></table>');document.querySelector('[name="edt900"]').click()`);
    await until(async () => !!documentResponse && await ui("!document.getElementById('resLoading').hidden"));
    assert.equal(ctx.views.res.getVisible(), false);
    assert.match(await ui("document.getElementById('resLoadingText').textContent"), /Finding 7-letter word/);
    ctx.patch({ resourcesLeft: true });
    await until(() => ui("document.getElementById('resPane').getBoundingClientRect().left===0"));
    assert.equal(ctx.views.res.getVisible(), false, 'Moving a loading resource never reveals an unfinished native view');
    const geometry = await ui("(()=>{const slot=document.getElementById('slotRes').getBoundingClientRect(),loader=document.getElementById('resLoading').getBoundingClientRect();return {dx:loader.x+loader.width/2-slot.x-slot.width/2,dy:loader.y+loader.height/2-slot.y-slot.height/2}})()");
    assert.ok(Math.abs(geometry.dx) < 2 && Math.abs(geometry.dy) < 2);
    ctx.win.webContents.debugger.attach('1.3');
    await ctx.win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.ok(await ui("[...document.querySelectorAll('.res-spinner i')].every(tile=>getComputedStyle(tile).animationName==='none')"));
    const start = performance.now(); releaseDocument(); await ready(7); const readyMs = performance.now() - start;
    assert.equal(assets, 0, 'A word data fetch never loads hosted images');
    assert.equal(await run('typeof window.hostedScriptExecuted'), 'undefined', 'Hosted scripts are never executed');
    assert.match(await run("document.querySelector('.found').textContent"), /^ch/);
    await run("window.__babbleExpertWordList.centrePrefix('charlie');document.querySelector('.found').click()");
    await until(() => run("document.querySelector('[data-be-result=green]')?.textContent==='charlie'"));
    open(6, '?fail=1'); await until(() => ui("document.getElementById('resLoading').hidden&&!document.getElementById('resRetry').hidden"));
    assert.ok(await run("document.getElementById('notice').textContent.includes('Could not load')"));
    const beforeCache = requests; open(7); await ready(7); assert.equal(requests, beforeCache, 'Reopening a fresh list does not download it again');
    documentResponse = null; open(7, '?delayed=1'); await until(() => !!documentResponse);
    open(4); await ready(4); releaseDocument(); await sleep(100);
    assert.equal(await run('document.title'), '4 Letter Words', 'A stale data response cannot replace the current length');
    documentResponse = null; open(7, '?delayed=2'); await until(() => !!documentResponse);
    ctx.hideResources(); releaseDocument(); await sleep(150);
    assert.equal(ctx.views.res.getVisible(), false); assert.ok(await ui("document.getElementById('resPane').hidden"));
    console.log(JSON.stringify({ result: 'PASS: centred loading, reduced motion, no hosted assets/scripts, cache, feedback, failure, stale response and Hide', readyAfterSourceMs: readyMs }));
  } finally { documentResponse?.end(); server.close(); }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
