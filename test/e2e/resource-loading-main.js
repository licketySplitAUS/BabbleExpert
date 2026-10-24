'use strict';
// Hold real word-list responses/assets to verify useful progress independently
// of the resource renderer, without displaying desktop windows.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict');
for (const method of ['show', 'showInactive', 'focus', 'maximize']) BrowserWindow.prototype[method] = function () {};
app.disableHardwareAcceleration();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'be-resource-loading-profile-'));
app.setPath('userData', profile);
app.on('web-contents-created', (_event, wc) => wc.setBackgroundThrottling(false));
const { createApp } = require('../../src/app');
const resources = require('../../src/resources');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 160; i++) { try { if (await fn()) return; } catch {} await sleep(50); }
  throw new Error('Timed out waiting for resource progress');
}
setTimeout(() => { console.error('Resource progress test timed out'); app.exit(1); }, 40000).unref();
app.whenReady().then(async () => {
  const source = process.env.WORD_LIST_DIR;
  assert.ok(source, 'Set WORD_LIST_DIR to the hosted word-list source');
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'be-resource-loading-'));
  let documentResponse, releaseDocument, assetResponse, releaseAsset;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/slow.png') {
      assetResponse = res;
      releaseAsset = () => res.end();
      return;
    }
    res.setHeader('content-type', 'text/html');
    if (/^\/words-\d+\.html$/.test(url.pathname)) {
      if (url.searchParams.has('fail')) { res.destroy(); return; }
      const html = fs.readFileSync(path.join(source, url.pathname.slice(1)), 'utf8').replace(/<link\b[^>]*>/gi, '');
      if (url.pathname === '/words-7.html') {
        documentResponse = res;
        const probe = `<script>
          window.loadProbe={};let api;
          const rect=Element.prototype.getBoundingClientRect;
          Element.prototype.getBoundingClientRect=function(){const start=performance.now();const result=rect.call(this);if(!api&&this.classList.contains('w')){loadProbe.firstRowMs=performance.now()-start;loadProbe.firstRowAt=performance.now()}return result};
          const replace=Element.prototype.replaceChildren;
          Element.prototype.replaceChildren=function(...args){const start=performance.now();const result=replace.apply(this,args);if(this.classList.contains('words')){loadProbe.replaceMs=performance.now()-start;loadProbe.replaceAt=performance.now()}return result};
          document.addEventListener('DOMContentLoaded',()=>loadProbe.dom=performance.now());
          Object.defineProperty(window,'__babbleExpertWordList',{configurable:true,get:()=>api,set:value=>{
            loadProbe.installed=performance.now();api=value;
            const centre=api.centreClue;
            api.centreClue=(...args)=>{const start=performance.now();const result=centre(...args);loadProbe.centreMs=performance.now()-start;return result};
          }});
        </script>`;
        releaseDocument = () => res.end(html.replace('<style>', probe + '<style>') + '<img src="/slow.png" hidden>');
      } else res.end(html);
      return;
    }
    res.end(fs.readFileSync(path.join(__dirname, 'fixtures', url.pathname === '/babble.html' ? 'babble.html' : 'clues.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${server.address().port}`;
  const ctx = createApp({ tourPrompt: false, telemetryPrompt: false, telemetryEndpoint: null,
    userDataDir: profile,
    urls: { babble: base + '/babble.html', clues: base + '/clues.html' }, hosts: { babble: ['localhost'], clues: ['localhost'] }, pace: 0 });
  const ui = code => ctx.win.webContents.executeJavaScript(code);
  const run = code => ctx.views.res.webContents.mainFrame.executeJavaScript(code);
  const clues = code => ctx.views.clues.webContents.executeJavaScript(code);
  const open = (length, query = '') => ctx.openResource({ ...resources.find(item => item.wordLength === length), url: `${base}/words-${length}.html${query}` });
  const ready = length => until(async () => ctx.views.res.webContents.getURL().includes(`words-${length}.html`) &&
    ctx.views.res.getVisible() && await ui(`document.getElementById('resLoading').hidden && !document.getElementById('resShorter').disabled`));
  try {
    await until(() => ctx.engine.state.ready && ctx.engine.state.puzzleMatch === true);
    open(4);
    await until(() => run(`!!window.__babbleExpertWordList`));
    await clues(`document.body.insertAdjacentHTML('beforeend','<table><tr><td>ch7,40</td><td><input type="checkbox"><input name="edt900" value="ch"></td></tr></table>');document.querySelector('[name="edt900"]').click()`);
    await until(() => !!documentResponse && ui(`!document.getElementById('resLoading').hidden`));
    assert.equal(ctx.views.res.getVisible(), false, 'Native resource view exposes the centred progress indicator');
    assert.match(await ui(`document.getElementById('resLoadingText').textContent`), /Finding 7-letter word/);
    assert.ok(await ui(`document.getElementById('resShorter').disabled && document.getElementById('resLonger').disabled`));
    await ui(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    const geometry = await ui(`(()=>{const slot=document.getElementById('slotRes').getBoundingClientRect(),loader=document.getElementById('resLoading').getBoundingClientRect();return {x:slot.x,y:slot.y,width:slot.width,height:slot.height,dx:loader.x+loader.width/2-slot.x-slot.width/2,dy:loader.y+loader.height/2-slot.y-slot.height/2}})()`);
    assert.ok(Math.abs(geometry.dx) < 2 && Math.abs(geometry.dy) < 2, 'Progress is centred in the resource page: ' + JSON.stringify(geometry));
    const shot = await ctx.win.webContents.capturePage({ x: Math.round(geometry.x), y: Math.round(geometry.y), width: Math.round(geometry.width), height: Math.round(geometry.height) });
    fs.writeFileSync(path.join(shots, 'finding-word.png'), shot.toPNG());
    ctx.win.webContents.debugger.attach('1.3');
    await ctx.win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.ok(await ui(`[...document.querySelectorAll('.res-spinner i')].every(tile=>getComputedStyle(tile).animationName==='none')`), 'Reduced motion keeps a static loading glyph');
    const started = performance.now();
    releaseDocument();
    await ready(7);
    const readyMs = performance.now() - started;
    const renderer = await run(`({setupMs:loadProbe.installed-loadProbe.dom,initialLayoutMs:loadProbe.firstRowMs,groupingMs:loadProbe.replaceAt-loadProbe.firstRowAt,centreMs:loadProbe.centreMs})`);
    assert.ok(assetResponse && !assetResponse.writableEnded && ctx.views.res.webContents.isLoading(), 'Word positioning finishes without waiting for an unrelated slow image');
    assert.match(await run(`document.querySelector('.found').textContent`), /^ch/);
    assert.ok(await run(`Math.abs(document.querySelector('.found').getBoundingClientRect().top+8-(innerHeight+26)/2)<3`), 'Destination is centred before the page is revealed');
    await run(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}});[...document.querySelectorAll('.w')].find(row=>row.textContent==='charlie').click()`);
    await until(() => run(`[...document.querySelectorAll('.w')].find(row=>row.textContent==='charlie').dataset.beResult==='green'`));
    releaseAsset();
    await until(() => !ctx.views.res.webContents.isLoading());
    open(6, '?fail=1');
    await until(() => ui(`document.getElementById('resLoading').hidden && !document.getElementById('resRetry').hidden`));
    assert.equal(ctx.views.res.getVisible(), true, 'Failure reveals the error page and Retry instead of leaving a spinner');
    documentResponse = null;
    open(7); await until(() => !!documentResponse);
    ctx.hideResources(); releaseDocument();
    await until(() => ui(`document.getElementById('resLoading').hidden && document.getElementById('resPane').hidden`));
    assert.equal(ctx.views.res.getVisible(), false, 'Hide cancels progress without reopening the pane');
    console.log(JSON.stringify({ result: 'PASS: centred progress, reduced motion, early positioning, result feedback, failure and Hide', readyBeforeAssetMs: readyMs, renderer, screenshots: shots }));
  } finally {
    documentResponse?.end(); assetResponse?.end(); server.close();
  }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
