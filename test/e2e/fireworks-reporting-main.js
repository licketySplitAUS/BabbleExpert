'use strict';
const { app, BrowserWindow, powerMonitor } = require('electron');
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
  let finishDownload;
  const { effects, labels } = require('../../src/experiments/celebrations').createBabbleCelebration({ getContext: () => null });
  const pack = { ...require('../../src/celebration-pack').bundledPack(), version: 1, effects, labels };
  pack.effects.push('new-show'); pack.labels.push('New hosted show');
  pack.renderer = pack.renderer.replace(/(const effects = \[[^\n]*)(\];)/, (_match, start, end) => start + ", 'new-show'" + end)
    .replace(/(const labels = \[[^\n]*)(\];)/, (_match, start, end) => start + ", 'New hosted show'" + end);
  pack.renderer = pack.renderer.replace("const ctx = canvas.getContext", "canvas.dataset.inputWordCount=String(options.words?.length || 0);const ctx = canvas.getContext");
  // Hidden native views do not receive compositor frames. Advance their real
  // renderer explicitly after the overlay arrives, as in the rendering fixture.
  pack.renderer = pack.renderer.replace('start(); return { start, destroy', 'start();globalThis.advanceCelebration=()=>{if(frame!==null)cancelAnimationFrame(frame);draw(performance.now());};return { start, destroy');
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(fs.readFileSync(path.join(__dirname, 'fixtures', req.url.startsWith('/babble') ? 'babble.html' : 'clues.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://localhost:' + server.address().port;
  const ctx = createApp({ userDataDir: app.getPath('userData'), version: '3.3.0.0', telemetryPrompt: false, tourPrompt: false,
    celebrationFetch: () => new Promise(resolve => { finishDownload = resolve; }),
    telemetryEndpoint: base+'/notify', telemetryFetch: async (_url, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; },
    urls: { babble: base+'/babble', clues: base+'/clues' }, hosts: { babble: ['localhost'], clues: ['localhost'] }, tickMs: 100, pace: 0 });
  const showReady = () => {
    const actual = new URL(ctx.views.res.webContents.getURL()), expected = new URL(ctx.experiments.fireworks.url);
    return actual.searchParams.get('run') === expected.searchParams.get('run') && actual.hash.includes('animation=');
  };
  const reports = () => sent.filter(row => /^Fireworks/.test(row.item || ''));
  try {
    await until(() => ctx.engine.state.ready && ctx.engine.state.cluesOk);
    assert.equal(finishDownload, undefined, 'celebration downloads do not run during startup');
    ctx.openResource(ctx.experiments.fireworks);
    await until(() => typeof finishDownload === 'function');
    ctx.hideResources();
    finishDownload(new Response(JSON.stringify(pack)));
    await until(() => fs.existsSync(path.join(app.getPath('userData'), 'celebrations', 'celebration-pack-v1.json')));
    await until(() => ctx.views.res.webContents.getURL() === 'about:blank');
    for (const view of [ctx.views.babble, ctx.views.clues]) assert.equal(await view.webContents.executeJavaScript("!!document.getElementById('babble-expert-fireworks')"), false, 'a late download cannot resurrect a hidden celebration');
    ctx.patch({ usageSharing: true });
    await ctx.views.babble.webContents.executeJavaScript("document.getElementById('total_words_left').textContent='0'");
    await ctx.engine.tick();
    await until(() => reports().length === 1);
    assert.equal(reports()[0].item, 'Fireworks');
    assert.equal(reports()[0].event, 'option');
    assert.equal(reports()[0].trigger, 'completion');
    assert.equal(reports()[0].animation, await ctx.views.res.webContents.executeJavaScript("document.getElementById('sky').dataset.animation"));
    await until(async () => await ctx.views.babble.webContents.executeJavaScript("!!document.getElementById('babble-expert-fireworks')") && await ctx.views.clues.webContents.executeJavaScript("!!document.getElementById('babble-expert-fireworks')"));
    const url = ctx.views.res.webContents.getURL();
    const rotationBeforeReplay = await ctx.views.res.webContents.executeJavaScript("localStorage.getItem('lickety-celebration-rotation:v1')");
    assert.equal(await ctx.views.res.webContents.executeJavaScript("document.getElementById('preview').hidden"), false, 'normal completion keeps replay controls available');
    await ctx.views.res.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'p'}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'p'}))");
    assert.equal(await ctx.views.res.webContents.executeJavaScript("document.getElementById('effectChoice').hidden && document.getElementById('effect').disabled"), true, 'P cannot reveal an effect chooser after normal completion');
    ctx.views.res.webContents.emit('did-navigate-in-page', {}, url, true);
    ctx.views.res.webContents.emit('did-navigate-in-page', {}, url, false);
    ctx.views.res.webContents.emit('did-navigate-in-page', {}, base+'/#fireworks=fake', true);
    await sleep(100); assert.equal(reports().length, 1, 'Three panes and repeated/foreign navigation cannot duplicate the report');
    await ctx.views.res.webContents.executeJavaScript("document.getElementById('play').click()");
    await until(() => reports().length === 2); assert.equal(reports()[1].item, 'Fireworks replay');
    assert.equal(reports()[1].animation, reports()[0].animation, 'normal replay repeats the selected celebration');
    assert.equal(new URLSearchParams(ctx.views.res.webContents.getURL().split('#')[1]).get('seed'), new URLSearchParams(url.split('#')[1]).get('seed'));
    assert.equal(reports()[1].trigger, 'replay');
    assert.equal(await ctx.views.res.webContents.executeJavaScript("localStorage.getItem('lickety-celebration-rotation:v1')"), rotationBeforeReplay);
    assert.doesNotMatch(JSON.stringify(reports()), /puzzleId|gridLetters|words|remaining|durationSeconds/);
    ctx.hideResources();
    await ctx.views.babble.webContents.executeJavaScript("document.getElementById('total_words_left').textContent='1'"); await ctx.engine.tick();
    await ctx.views.babble.webContents.executeJavaScript("document.getElementById('total_words_left').textContent='0'"); await ctx.engine.tick();
    await sleep(150);
    assert.equal(reports().length, 2, 'A fluctuating counter must not celebrate the same grid twice');
    ctx.openResource(ctx.experiments.fireworks);
    await until(() => reports().length === 3);
    assert.equal(reports()[2].trigger, 'preview');
    ctx.views.res.webContents.reload();
    await until(() => reports().length === 4);
    assert.equal(reports()[3].trigger, 'reload');
    const beforeOptOut = reports().length;
    ctx.hideResources(); ctx.patch({ usageSharing: false });
    await ctx.views.babble.webContents.executeJavaScript("document.getElementById('total_words_left').textContent='1'"); await ctx.engine.tick();
    await ctx.views.babble.webContents.executeJavaScript("document.getElementById('total_words_left').textContent='0'"); await ctx.engine.tick();
    ctx.openResource(ctx.experiments.fireworks);
    await until(() => ctx.views.res.webContents.getURL().includes('fireworks='));
    await sleep(150); assert.equal(reports().length, beforeOptOut, 'Opted-out celebrations remain unreported');
    const beforeReload = await ctx.views.res.webContents.executeJavaScript("JSON.parse(localStorage.getItem('lickety-celebration-rotation:v1'))");
    const previousUrl = ctx.views.res.webContents.getURL();
    ctx.views.res.webContents.reload();
    await until(() => ctx.views.res.webContents.getURL() !== previousUrl && ctx.views.res.webContents.getURL().includes('animation='));
    const afterReload = await ctx.views.res.webContents.executeJavaScript("JSON.parse(localStorage.getItem('lickety-celebration-rotation:v1'))");
    assert.ok(beforeReload.remaining.includes(afterReload.last), 'reload chooses from the saved remaining effects');
    assert.equal(afterReload.remaining.length, beforeReload.remaining.length - 1, 'the persisted resource profile continues its rotation after reload');
    for (const view of Object.values(ctx.views)) {
      view.webContents.debugger.attach('1.3');
      await view.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    }
    assert.equal(ctx.settings.data.celebrationAnimations, true, 'animations override reduced motion by default');
    ctx.patch({ celebrationAnimations: false }); ctx.hideResources(); ctx.openResource(ctx.experiments.fireworks);
    await until(async () => ctx.views.res.webContents.getURL().includes('animation=message'));
    await until(async () => await ctx.views.babble.webContents.executeJavaScript("document.getElementById('babble-expert-fireworks')?.dataset.animation === 'message'"));
    ctx.patch({ celebrationAnimations: true }); ctx.hideResources(); ctx.openResource(ctx.experiments.fireworks);
    await until(async () => ctx.views.res.webContents.getURL().includes('animations=1') && ctx.views.res.webContents.getURL().includes('&animation=') && !ctx.views.res.webContents.getURL().includes('animation=message'));
    const animation = await ctx.views.res.webContents.executeJavaScript("document.getElementById('sky').dataset.animation");
    for (const view of [ctx.views.babble, ctx.views.clues]) await until(async () => await view.webContents.executeJavaScript(`document.getElementById('babble-expert-fireworks')?.dataset.animation === ${JSON.stringify(animation)}`));
    ctx.patch({ celebrationAnimations: false }); ctx.hideResources(); ctx.openResource(ctx.experiments.fireworks);
    await until(async () => ctx.views.res.webContents.getURL().includes('animation=message') && !ctx.views.res.webContents.getURL().includes('animations=1'));
    for (const view of Object.values(ctx.views)) await view.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    const beforeStatic = ctx.views.res.webContents.getURL();
    ctx.hideResources(); ctx.openResource(ctx.experiments.fireworks);
    await until(async () => ctx.views.res.webContents.getURL() !== beforeStatic && ctx.views.res.webContents.getURL().includes('animation=message'));
    for (const view of [ctx.views.babble, ctx.views.clues]) await until(async () => await view.webContents.executeJavaScript("document.getElementById('babble-expert-fireworks')?.dataset.animation === 'message'"));
    for (const view of Object.values(ctx.views)) view.webContents.debugger.detach();
    ctx.hideResources();
    const originalMinimized = ctx.win.isMinimized.bind(ctx.win), originalTick = ctx.engine.tick.bind(ctx.engine);
    let minimized = true, scans = 0;
    ctx.win.isMinimized = () => minimized;
    ctx.engine.tick = async () => { scans++; return originalTick(); };
    ctx.win.emit('minimize');
    assert.equal(ctx.views.res.webContents.getBackgroundThrottling(), true);
    await sleep(350); // More than three scheduled 100 ms polling opportunities.
    assert.equal(scans, 0, 'Minimized Expert does not start background page scans');
    minimized = false; ctx.win.emit('restore');
    await until(() => scans > 0);
    assert.equal(ctx.views.res.webContents.getBackgroundThrottling(), false);
    const beforeSuspend = scans;
    powerMonitor.emit('suspend');
    await sleep(350);
    assert.equal(scans, beforeSuspend, 'Suspended Expert does not start background page scans');
    assert.equal(ctx.views.res.webContents.getBackgroundThrottling(), true);
    powerMonitor.emit('resume');
    await until(() => scans > beforeSuspend);
    assert.equal(ctx.views.res.webContents.getBackgroundThrottling(), false);
    ctx.win.isMinimized = originalMinimized; ctx.engine.tick = originalTick;
    ctx.patch({ celebrationAnimations: true, usageSharing: true }); ctx.hideResources();
    await ctx.views.clues.webContents.executeJavaScript("(()=>{const logo=document.createElement('img');logo.src='/MyLogo.gif';document.body.appendChild(logo);for(let i=0;i<5;i++)logo.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));logo.remove()})()");
    await until(() => ctx.views.res.webContents.getURL().includes('chooser=1') && ctx.views.res.webContents.getURL().includes('animation='));
    assert.equal(await ctx.views.res.webContents.executeJavaScript("document.getElementById('effectChoice').hidden"), false, 'five-click launcher enables the test chooser');
    assert.equal(await ctx.views.res.webContents.executeJavaScript("Array.from(document.querySelectorAll('#effect option')).some(o=>o.value==='new-show')"), true);
    const testingRotation = await ctx.views.res.webContents.executeJavaScript("localStorage.getItem('lickety-celebration-rotation:v1')");
    await ctx.views.res.webContents.executeJavaScript("document.getElementById('effect').value='new-show';document.getElementById('play').click()");
    await until(() => reports().at(-1)?.animation === 'new-show');
    assert.equal(await ctx.views.res.webContents.executeJavaScript("localStorage.getItem('lickety-celebration-rotation:v1')"), testingRotation, 'explicit test choices do not consume the surprise rotation');
    for (const view of [ctx.views.babble, ctx.views.clues]) {
      await until(async () => await view.webContents.executeJavaScript("document.getElementById('babble-expert-fireworks')?.dataset.effect === 'new-show'"));
      assert.equal(await view.webContents.executeJavaScript("document.getElementById('babble-expert-fireworks').dataset.sound === 'playing'"), false);
    }
    ctx.hideResources();
    for (const view of [ctx.views.babble, ctx.views.clues]) await until(async () => await view.webContents.executeJavaScript("!document.getElementById('babble-expert-fireworks')"));
    await ctx.views.babble.webContents.executeJavaScript("document.querySelector('#word_list tbody').innerHTML='<tr><td class=word>alpha</td><td class=word>bravo</td><td class=word>charlie</td></tr>'");
    const observedWords = await require('../../src/pages').makePages({ getBabble: () => ctx.views.babble.webContents, getClues: () => ctx.views.clues.webContents, babbleHosts: ['localhost'], cluesHosts: ['localhost'], allowLocal: true }).babble.state(true);
    assert.deepEqual(require('../../src/fireworks-overlay').celebrationWords(observedWords, ctx.engine.state.gridLetters), ['alpha', 'bravo', 'charlie']);
    ctx.openResource(ctx.experiments.fireworks);
    await until(showReady);
    assert.equal(await ctx.views.res.webContents.executeJavaScript("document.getElementById('effectChoice').hidden && document.getElementById('effect').disabled"), true, 'a normal opening after testing does not retain the chooser');
    for (const view of Object.values(ctx.views)) {
      await view.webContents.executeJavaScript(`window.cloudWords=new Set();window.savedFillText=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(['alpha','bravo','charlie','delta'].includes(text))window.cloudWords.add(text);return window.savedFillText.call(this,text,...args)};void 0;`);
    }
    await ctx.views.res.webContents.executeJavaScript("fireworks.start({type:'click'},'word-cloud')");
    for (const [name, view] of Object.entries(ctx.views)) {
      await until(async () => await view.webContents.executeJavaScript("document.querySelector('canvas')?.dataset.effect==='word-cloud'"));
      await view.webContents.executeJavaScript('advanceCelebration()');
      try { await until(async () => await view.webContents.executeJavaScript("['alpha','bravo','charlie'].every(word=>window.cloudWords.has(word))")); }
      catch { throw Error('Cloud words missing in ' + name + ': ' + JSON.stringify(await view.webContents.executeJavaScript("({seen:[...window.cloudWords],effect:document.querySelector('canvas')?.dataset.effect,count:document.querySelector('canvas')?.dataset.inputWordCount})"))); }
    }
    assert.doesNotMatch(ctx.views.res.webContents.getURL(), /alpha|bravo|charlie/);
    assert.doesNotMatch(JSON.stringify(sent), /alpha|bravo|charlie/);
    const savedPack = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'celebrations', 'celebration-pack-v1.json'), 'utf8'));
    assert.equal(savedPack.words, undefined);
    assert.doesNotMatch(savedPack.renderer, /['"](?:alpha|bravo|charlie)['"]/);
    ctx.hideResources();
    // A subsequent grid gets only its own words, even with the same legacy ID.
    await ctx.views.babble.webContents.executeJavaScript("document.querySelector('#left_column img').src='/images/z.gif';document.querySelector('#word_list tbody').innerHTML='<tr><td class=word>delta</td></tr>'");
    await ctx.engine.tick(); ctx.openResource(ctx.experiments.fireworks);
    await until(showReady);
    for (const view of [ctx.views.babble, ctx.views.clues]) await view.webContents.executeJavaScript('window.cloudWords.clear()');
    await ctx.views.res.webContents.executeJavaScript("fireworks.start({type:'click'},'word-cloud')");
    for (const view of [ctx.views.babble, ctx.views.clues]) {
      await until(async () => await view.webContents.executeJavaScript("document.querySelector('canvas')?.dataset.effect==='word-cloud'"));
      await view.webContents.executeJavaScript('advanceCelebration()');
      await until(async () => await view.webContents.executeJavaScript("window.cloudWords.has('delta')"));
      assert.equal(await view.webContents.executeJavaScript("['alpha','bravo','charlie'].some(word=>window.cloudWords.has(word))"), false);
    }
    ctx.hideResources();
    console.log('PASS: downloaded new effect, chooser, synchronized silent overlays and reporting; saved rotation/motion, completion ownership, pause/resume.');
  } finally { server.close(); }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
