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

  const ctx = createApp({ userDataDir: dir, urls: { babble: base + '/babble.html', clues: base + '/clues.html' }, hosts: { babble: ['localhost'], clues: ['localhost'] }, tickMs: 300, pace: 0 });
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

  await key('Bravo');
  ok(await until(async () => (await ticked()).includes('bravo')), 'typing a puzzle word + Enter ticks it on the Clues page');
  ok(await until(async () => (await grid()).includes('bravo')), '...and adds it to the Babble grid');
  ok(await bg() === 'rgb(151, 204, 50)', 'green flash for a newly ticked word');
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
  ok(await until(() => views.res.getBounds().width >= 420), 'Resources pane opens beside Babble at its minimum width: ' + views.res.getBounds().width + 'px');
  ok(views.res.getBounds().x > views.babble.getBounds().x, 'Resources pane is to the right of Babble');
  ctx.openResource({ label: '4 Letter Words', url: base + '/resource.html', width: 150, external: false });
  ok(await until(() => views.res.getBounds().width === 150), 'Word list sets its compact pane width: ' + views.res.getBounds().width + 'px');
  ok(await ui(`document.getElementById('resOpen').hidden`), 'Word list hides Open in browser');
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
