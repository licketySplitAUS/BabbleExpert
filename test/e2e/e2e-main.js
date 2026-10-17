'use strict';
// Runs the real app in a virtual display against local fake Babble/Clues pages and clicks the real buttons.
const { app } = require('electron');
app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu'); app.disableHardwareAcceleration();
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createApp } = require('../../src/app');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; };
async function until(fn, ms = 15000, step = 100) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* keep trying */ } await sleep(step); } return false; }

app.whenReady().then(async () => {
  const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n));
  const server = http.createServer((q, s) => {
    const m = { '/babble.html': 'babble.html', '/clues.html': 'clues.html', '/resource.html': 'resource.html' }[q.url.split('?')[0]];
    if (!m) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', 'text/html'); s.end(fx(m));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://localhost:' + server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-e2e-'));

  const telemetryEvents = [];
  const ctx = createApp({ userDataDir: dir, version: '3.1.2.0', telemetryPrompt: false, telemetryEndpoint: 'https://example.test/api/babble-notify', telemetryFetch: async (_url, options) => { telemetryEvents.push(JSON.parse(options.body)); return { ok: true }; }, urls: { babble: base + '/babble.html', clues: base + '/clues.html' }, hosts: { babble: ['localhost'], clues: ['localhost'] }, tickMs: 300, pace: 0 });
  ctx.patch({ usageSharing: true });
  const { win, engine, views } = ctx;
  const ui = js => win.webContents.executeJavaScript(js);
  const inBabble = js => views.babble.webContents.executeJavaScript(js);
  const inClues = js => views.clues.webContents.executeJavaScript(js);
  const grid = async () => JSON.parse(await inBabble(`JSON.stringify([].map.call(document.querySelectorAll('#word_list td.word'),e=>e.textContent))`));
  const ticked = async () => JSON.parse(await inClues('JSON.stringify(ticked)'));
  win.show();

  /* 1 ---- start-up */
  ok(await until(() => engine.state.ready && engine.state.cluesOk), 'both pages load; engine sees puzzle ' + engine.state.puzzleId + ' with ' + engine.state.remaining + ' words left');
  ok(engine.state.puzzleId === '8097', 'puzzle id read with the Delphi rule (4 chars before "chat_log")');
  await sleep(600);
  ok(await ui(`!document.querySelector('#btnGet').disabled && !document.querySelector('#btnSend').disabled`), 'toolbar: both send buttons enabled');
  ok(await ui(`document.querySelector('#btnClueSource').textContent`) === "Clues: Lickety's ▾", 'toolbar: clue source selector shows the saved source');
  ok((await ui(`document.querySelector('#chip').textContent`)).includes('Words left: 4'), 'toolbar chip shows words left');
  await inClues(`document.getElementById('lickety-heart').click();document.getElementById('lickety-heart').click();document.getElementById('lickety-heart').click();document.getElementById('lickety-heart').click()`);
  await sleep(200);
  ok(await ui(`document.getElementById('resPane').hidden`), 'four heart-logo clicks do not start the hidden preview');
  await inClues(`document.getElementById('lickety-heart').click()`);
  ok(await until(async () => (await views.res.webContents.executeJavaScript(`document.title`)) === 'Fireworks'), 'five rapid heart-logo clicks start Fireworks without finishing the puzzle');
  ok(engine.state.remaining === '4', 'hidden preview leaves the puzzle word count unchanged');
  ok(await until(async () => await inBabble(`!!document.getElementById('babble-expert-fireworks')`) && await inClues(`!!document.getElementById('babble-expert-fireworks')`)), 'hidden preview starts both transparent page overlays');
  ctx.hideResources();
  await until(async () => await inBabble(`!document.getElementById('babble-expert-fireworks')`));

  /* 2 ---- native views sit exactly over the two page boxes */
  const slot = async id => JSON.parse(await ui(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return JSON.stringify({x:Math.round(r.left),y:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)})})()`));
  const same = (a, b) => ['x', 'y', 'width', 'height'].every(k => Math.abs(a[k] - b[k]) <= 1);
  ok(same(views.clues.getBounds(), await slot('slotClues')) && same(views.babble.getBounds(), await slot('slotBabble')), 'layout: Clues and Babble views fill their boxes ' + JSON.stringify(views.babble.getBounds()));
  ok(views.clues.getBounds().x < views.babble.getBounds().x, 'layout: Clues on the left by default');

  /* 3 ---- Babble -> Clues button (real click) */
  await ui(`document.querySelector('#btnGet').click()`);
  ok(await until(async () => (await ticked()).length === 1), 'click "<- Send Words to Clues": grid word ticked on Clues page');
  ok(JSON.stringify(await ticked()) === '["alpha"]', 'only the real puzzle word was ticked (the non-clue was ignored)');
  ok(await inClues(`document.getElementById('totalOnCount').textContent`) === '1', 'showAll() refreshed the Clues page counters');

  /* 4 ---- Lickety Add box (real window, real key events) */
  ctx.setAddVisible(true);
  const add = () => ctx.getAddWindow();
  ok(await until(() => add() && add().isVisible() && !add().webContents.isLoading()), 'Add box opens as its own window');
  ok(add().isAlwaysOnTop(), 'Add box is always on top');
  const key = (text, mods = '') => add().webContents.executeJavaScript(`(()=>{const t=document.getElementById('mmoAdd');t.value=${JSON.stringify(text)};t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,${mods}}));})()`);
  const bg = () => add().webContents.executeJavaScript(`getComputedStyle(document.getElementById('mmoAdd')).backgroundColor`);
  const val = () => add().webContents.executeJavaScript(`document.getElementById('mmoAdd').value`);

  await add().webContents.executeJavaScript(`(()=>{const t=document.getElementById('mmoAdd');t.value='brav';t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  ok(await until(async () => (await inBabble(`document.querySelector('#babble-expert-glow .be-live').dataset.tiles`)) === '4'), 'typing draws one connected contour over the Babble grid');
  ctx.patch({ highlightEntry: false });
  ok(await until(async () => await inBabble(`document.getElementById('babble-expert-glow').style.display === 'none'`)), 'Highlight entry on grid can immediately hide and disable the overlay');
  ctx.patch({ highlightEntry: true });
  ok(await until(async () => await inBabble(`document.getElementById('babble-expert-glow').style.display !== 'none'`)), 'Highlight entry on grid can be switched back on');
  await key('Bravo');
  ok(await until(async () => (await ticked()).includes('bravo')), 'typing a puzzle word + Enter ticks it on the Clues page');
  ok(await until(async () => (await grid()).includes('bravo')), '...and adds it to the Babble grid');
  ok(await bg() === 'rgb(151, 204, 50)', 'green flash for a newly ticked word');
  ok(await until(async () => await inBabble(`!!document.querySelector('#babble-expert-glow .be-release.green')`)), 'valid word path blooms and drifts away in green');
  ok(await val() === '', 'box cleared after sending');
  await sleep(1100); ok(await bg() === 'rgb(255, 255, 255)', 'flash fades back to white after the speed delay');
  await key('bravo'); await sleep(250); ok(await bg() === 'rgb(255, 204, 1)', 'amber flash when already ticked');
  ok((await grid()).filter(w => w === 'bravo').length === 1, '...and it is not sent to Babble twice');
  await sleep(1000);
  await key('zzzzz'); await sleep(250); ok(await bg() === 'rgb(151, 0, 0)', 'red flash for a word that is not a clue');
  await sleep(1000);
  await key('good luck all'); await sleep(250);
  ok(await bg() === 'rgb(103, 151, 172)', 'multi-word text flashes the chat colour');
  ok(await until(async () => (await inBabble(`document.getElementById('chat_log').textContent`)).includes('good luck all')), 'chat message reaches the Babble page chat form');
  await sleep(1000);
  await key('delta', 'ctrlKey:true');
  ok(await until(async () => (await inBabble(`document.getElementById('chat_log').textContent`)).includes('delta')), 'Ctrl+Enter forces a single word to Chat');
  ok(!(await ticked()).includes('delta'), '...without touching the Clues page');

  /* 5 ---- Clues -> Babble button */
  await inClues(`AddBabbleWord('charlie')`);
  await ui(`document.querySelector('#btnSend').click()`);
  ok(await until(async () => (await grid()).includes('charlie')), 'click "Send Words to Babble ->": ticked Clues word arrives in the grid');
  const g = await grid(); ok(new Set(g).size === g.length, 'no duplicates in the grid: ' + g.join(','));
  ok(await until(() => engine.state.remaining === '1'), 'words-left counter follows the page: ' + engine.state.remaining);
  ok((await add().webContents.executeJavaScript(`document.getElementById('lblRemaining').textContent`)) === '1', 'Add box shows words left');

  /* 6 ---- Switch Sides */
  ctx.patch({ switchSides: true });
  ok(await until(() => views.babble.getBounds().x < views.clues.getBounds().x), 'Switch Sides: Babble moves left, Clues right (pages not reloaded)');
  ok(await ui(`document.querySelector('#btnGet').textContent`) === 'Send Words to Clues →' && await ui(`document.querySelector('#btnSend').textContent`) === '← Send Words to Babble', 'Switch Sides: button arrows flip');
  ok(await inClues('ticked.length') >= 2, 'Clues page kept its ticks (no reload)');
  ctx.patch({ switchSides: false });

  /* 7 ---- safety: never script a page that isn't on an expected host */
  await views.babble.webContents.loadURL(base.replace('localhost', '127.0.0.1') + '/babble.html');
  await sleep(300);
  let refused = false; try { await engine.pages.babble.addWord('x'); } catch (e) { refused = /expected website/.test(e.message); }
  ok(refused, 'scripting is refused when Babble view is on an unexpected host');
  ctx.refreshBabble(); await until(() => engine.state.ready);

  /* 8 ---- resources pane */
  ctx.openResource({ label: 'Fake word finder', url: base + '/resource.html', minWidth: 420 });
  ok(await until(() => telemetryEvents.some(event => event.event === 'resource' && event.item === 'Fake word finder')), 'opening a Resource sends its anonymous menu-use event after opt-in');
  ok(await until(() => views.res.getBounds().width >= 420), 'Resources pane opens beside Babble at its minimum width: ' + views.res.getBounds().width + 'px');
  ok(views.res.getBounds().x > views.babble.getBounds().x, 'Resources pane is to the right of Babble');
  ctx.openResource({ label: '4 Letter Words', url: base + '/resource.html', width: 90, external: false, showTitle: false });
  ok(await until(() => views.res.getBounds().width === 90), 'Word list sets its compact pane width: ' + views.res.getBounds().width + 'px');
  ok(await ui(`document.getElementById('resOpen').hidden`), 'Word list hides Open in browser');
  ok(await ui(`document.getElementById('resTitle').hidden`), 'Word list hides the resource title');
  ctx.openResource({ label: '4 Letter Words', url: base + '/resource.html', width: 90, external: false, showTitle: false, submitWords: true });
  await inBabble(`left=1; document.getElementById('total_words_left').textContent='1'`);
  await until(() => engine.state.remaining === '1');
  await views.res.webContents.executeJavaScript(`location.hash = 'submit=delta&nonce=1'`);
  ok(await until(async () => (await ticked()).includes('delta')), 'clicking a resource word submits it to Clues');
  ok(await until(async () => (await grid()).includes('delta')), '...and submits it to Babble');
  ok(await until(async () => (await bg()) === 'rgb(151, 204, 50)'), 'visible Lickety Add shows the submission result');
  ok(await until(async () => (await views.res.webContents.executeJavaScript(`document.title`)) === 'Fireworks'), 'finishing the final word automatically opens Fireworks in the right pane');
  ok(await views.res.webContents.executeJavaScript(`document.getElementById('sky').dataset.running === 'true'`), 'the 60-second fireworks celebration starts automatically');
  ok(await until(async () => await inBabble(`!!document.getElementById('babble-expert-fireworks')`) && await inClues(`!!document.getElementById('babble-expert-fireworks')`)), 'the celebration also overlays the existing Babble and Clues pages');
  ok(await inBabble(`getComputedStyle(document.getElementById('babble-expert-fireworks')).pointerEvents === 'none'`) && await inClues(`getComputedStyle(document.getElementById('babble-expert-fireworks')).pointerEvents === 'none'`), 'transparent overlays let mouse input through to both original pages');
  ok((await grid()).includes('delta') && (await ticked()).includes('delta'), 'the underlying puzzle and clue ticks remain intact');
  ok(await ui(`document.getElementById('resTitle').hidden && document.getElementById('resOpen').hidden && !document.getElementById('resClose').hidden`), 'Fireworks exposes only the right-pane Hide control');
  await inBabble(`window.previousFireworksCanvas=document.getElementById('babble-expert-fireworks')`);
  await views.res.webContents.executeJavaScript(`document.getElementById('sky').click()`);
  ok(await views.res.webContents.executeJavaScript(`document.getElementById('sky').dataset.running === 'true'`), 'clicking the fireworks page restarts the celebration');
  ok(await until(async () => await inBabble(`document.getElementById('babble-expert-fireworks') !== window.previousFireworksCanvas && document.querySelectorAll('#babble-expert-fireworks').length === 1`)), 'replaying restarts the overlays without stacking canvases');
  ctx.hideResources();
  ok(await until(async () => await inBabble(`!document.getElementById('babble-expert-fireworks')`) && await inClues(`!document.getElementById('babble-expert-fireworks')`)), 'Hide immediately clears both page overlays');

  ctx.openResource({ label: 'Lickety Info', url: 'https://licketysplitaus.github.io/Babble/lickety-info.html', local: 'experiments/lickety-info.html', minWidth: 420 });
  ok(await until(async () => (await views.res.webContents.executeJavaScript(`document.title`)) === 'About licketySplitAUS'), 'Lickety Info opens its packaged local page without publishing');
  ok(await views.res.webContents.executeJavaScript(`document.body.textContent.includes('Voice Canvas') && document.body.textContent.includes('Protoplasm')`), 'Lickety Info links to Babble experiments');

  ctx.openResource(ctx.experiments.funWordPlay);
  ok(await until(() => telemetryEvents.some(event => event.event === 'option' && event.item === 'Fun Word Play')), 'opening a visual Option sends its anonymous menu-use event after opt-in');
  ok(await until(async () => (await views.res.webContents.executeJavaScript(`typeof window.BabbleExpertInteract`)) === 'function'), 'Fun Word Play opens in the right resource pane');
  ok(await views.res.webContents.executeJavaScript(`!document.getElementById('live') && !document.getElementById('entry') && !document.getElementById('save')`), 'Fun Word Play has no duplicate word display, entry box, or save control');
  ctx.sendResourceInteraction({ type: 'word', phase: 'preview', word: 'rainbow' });
  ctx.sendResourceInteraction({ type: 'word', phase: 'submit', word: 'rainbow', color: 'green' });
  ok(await until(async () => await views.res.webContents.executeJavaScript(`getComputedStyle(document.getElementById('intro')).opacity === '0'`)), 'submitted word blooms onto Fun Word Play');

  ctx.openResource(ctx.experiments.chillVibes);
  ok(await until(async () => (await views.res.webContents.executeJavaScript(`typeof window.BabbleExpertInteract`)) === 'function'), 'Chill Vibes opens in the right resource pane');
  ok(await views.res.webContents.executeJavaScript(`document.body.innerText.trim() === ''`), 'Chill Vibes contains no visible page text');
  ctx.sendResourceInteraction({ type: 'word', phase: 'submit', word: 'plasma', color: 'amber' });
  ok(await until(async () => (await views.res.webContents.executeJavaScript(`document.getElementById('canvas').dataset.interaction`)) === 'word'), 'submitted word ripples through Chill Vibes without displaying text');
  ctx.sendResourceInteraction({ type: 'key', key: 'x', code: 'KeyX' });
  ok(await until(async () => (await views.res.webContents.executeJavaScript(`document.getElementById('canvas').dataset.interaction`)) === 'key'), 'Chill Vibes accepts gentler relayed Expert key presses');
  ctx.hideResources(); ok(await until(async () => (await ui(`document.getElementById('resPane').hidden`))), 'Hide Resources closes it');

  /* 9 ---- settings persisted */
  ctx.patch({ yellow: true, add: { thin: true, speed: 5 } });
  ok(await until(async () => (await add().webContents.executeJavaScript(`document.body.classList.contains('thin')`))), 'Thin Box applies live in the Add window');
  ctx.settings.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  ok(saved.yellow === true && saved.add.thin === true && saved.add.speed === 5 && saved.add.visible === true && saved.add.bounds, 'settings.json holds theme, Add options, Add visibility and position');

  /* screenshots for a human look */
  try {
    const out = process.env.SHOT_DIR; if (out) {
      ctx.patch({ yellow: false, add: { thin: false } }); await sleep(500);
      fs.writeFileSync(path.join(out, 'toolbar.png'), (await win.webContents.capturePage()).toPNG());
      fs.writeFileSync(path.join(out, 'add.png'), (await add().webContents.capturePage()).toPNG());
    }
  } catch (e) { console.log('screenshot skipped:', e.message); }

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  server.close(); app.exit(failures ? 1 : 0);
}).catch(e => { console.error('E2E crashed', e); app.exit(2); });
