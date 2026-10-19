'use strict';
// Runs the real app in a virtual display against local fake Babble/Clues pages and clicks the real buttons.
const { app, BrowserWindow, shell } = require('electron');
app.commandLine.appendSwitch('no-sandbox');
// Exercise Chill Vibes' real WebGL renderer even on GitHub's GPU-less Linux VM.
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createApp } = require('../../src/app');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; };
async function until(fn, ms = 15000, step = 100) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* keep trying */ } await sleep(step); } return false; }

app.whenReady().then(async () => {
  const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n));
  const server = http.createServer((q, s) => {
    const m = { '/babble.html': 'babble.html', '/clues.html': 'clues.html', '/selfserve.html': 'clues.html', '/resource.html': 'resource.html' }[q.url.split('?')[0]];
    if (!m) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', 'text/html'); s.end(fx(m));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://localhost:' + server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-e2e-'));

  const telemetryEvents = [];
  const ctx = createApp({ tourPrompt: false, userDataDir: dir, version: '3.1.2.0', telemetryPrompt: false, telemetryEndpoint: 'https://example.test/api/babble-notify', telemetryFetch: async (_url, options) => { telemetryEvents.push(JSON.parse(options.body)); return { ok: true }; }, urls: { babble: base + '/babble.html', clues: base + '/clues.html', selfServeClues: base + '/selfserve.html' }, hosts: { babble: ['localhost'], clues: ['localhost'] }, tickMs: 300, pace: 0 });
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
  const getHelp = () => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/help.html'));
  ok(!getHelp(), 'the optional guide does not interrupt startup');
  await ui(`document.getElementById('btnHelp').click()`);
  ok(await until(() => getHelp() && !getHelp().webContents.isLoading()), 'Help opens the packaged offline guide');
  const help = getHelp();
  ok(await help.webContents.executeJavaScript(`document.querySelectorAll('.steps > li').length === 3 && document.querySelectorAll('.colours > li').length === 4`), 'the quick guide has three steps and explains all four feedback colours');
  ok(await help.webContents.executeJavaScript(`document.querySelector('.features').textContent.includes('last word you clicked') && document.querySelector('.features').textContent.includes('Off filter') && document.querySelectorAll('.videos a').length === 2`), 'Help describes the new sync, grid and word-list features and includes both videos');
  const videoUrls = [], originalOpenExternal = shell.openExternal;
  try {
    shell.openExternal = async url => { videoUrls.push(url); };
    await help.webContents.executeJavaScript(`document.querySelectorAll('.videos a').forEach(link => link.click())`);
    ok(await until(() => videoUrls.length === 2), 'Help video links open in the external browser');
    ok(videoUrls.includes('https://youtu.be/IBgTrBk35uI') && videoUrls.includes('https://youtu.be/6ZK0IiQIkk4') && help.webContents.getURL().endsWith('/help.html'), 'both video URLs are correct and Help stays open');
  } finally { shell.openExternal = originalOpenExternal; }
  if (process.env.SHOT_DIR) fs.writeFileSync(path.join(process.env.SHOT_DIR, 'help-guide.png'), (await help.webContents.capturePage()).toPNG());
  await help.webContents.executeJavaScript(`document.getElementById('shortcutsTab').click()`);
  ok(await help.webContents.executeJavaScript(`!document.getElementById('shortcuts').hidden && document.getElementById('guide').hidden && document.querySelectorAll('#shortcuts tbody tr').length === 8`), 'keyboard shortcuts are available in the same Help dialog');
  await help.webContents.executeJavaScript(`document.getElementById('updatesTab').click()`);
  ok(await help.webContents.executeJavaScript(`!document.getElementById('updates').hidden && document.getElementById('updates').textContent.includes('silently without reopening') && document.getElementById('updates').textContent.includes('desktop shortcut')`), 'Help explains update progress, restart, Later and the unchanged shortcut');
  if (process.env.SHOT_DIR) fs.writeFileSync(path.join(process.env.SHOT_DIR, 'help-updates.png'), (await help.webContents.capturePage()).toPNG());
  await help.webContents.executeJavaScript(`document.getElementById('shortcutsTab').click()`);
  await help.webContents.executeJavaScript(`document.getElementById('shortcutsTab').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft',bubbles:true}))`);
  ok(await help.webContents.executeJavaScript(`document.getElementById('guideTab').getAttribute('aria-selected') === 'true' && !document.getElementById('guide').hidden`), 'Help tabs support keyboard navigation');
  help.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  ok(await until(() => !getHelp()), 'Escape closes Help and leaves the puzzle open');
  views.babble.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F1' });
  views.babble.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F1' });
  ok(await until(() => getHelp() && !getHelp().webContents.isLoading()), 'F1 opens Help while the Babble pane has focus');
  getHelp().close();
  await inClues(`document.getElementById('lickety-heart').click();document.getElementById('lickety-heart').click();document.getElementById('lickety-heart').click();document.getElementById('lickety-heart').click()`);
  await sleep(200);
  ok(await ui(`document.getElementById('resPane').hidden`), 'four heart-logo clicks do not start the hidden preview');
  await inClues(`document.getElementById('lickety-heart').click()`);
  ok(await until(async () => (await views.res.webContents.executeJavaScript(`document.title`)) === 'Fireworks'), 'five rapid heart-logo clicks start Fireworks without finishing the puzzle');
  ok(engine.state.remaining === '4', 'hidden preview leaves the puzzle word count unchanged');
  ok(await until(async () => await inBabble(`!!document.getElementById('babble-expert-fireworks')`) && await inClues(`!!document.getElementById('babble-expert-fireworks')`)), 'hidden preview starts both transparent page overlays');
  ok(telemetryEvents.filter(event => event.event === 'option' && event.item === 'Fireworks').length === 1, 'user-triggered Fireworks sends one usage notification');
  ctx.hideResources();
  await until(async () => await inBabble(`!document.getElementById('babble-expert-fireworks')`));

  /* 2 ---- native views sit exactly over the two page boxes */
  const slot = async id => JSON.parse(await ui(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return JSON.stringify({x:Math.round(r.left),y:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)})})()`));
  const same = (a, b) => ['x', 'y', 'width', 'height'].every(k => Math.abs(a[k] - b[k]) <= 1);
  ok(await until(async () => same(views.clues.getBounds(), await slot('slotClues')) && same(views.babble.getBounds(), await slot('slotBabble'))), 'layout: Clues and Babble views fill their boxes ' + JSON.stringify(views.babble.getBounds()));
  ok(views.clues.getBounds().x < views.babble.getBounds().x, 'layout: Clues on the left by default');

  /* 3 ---- Babble -> Clues button (real click) */
  await ui(`document.querySelector('#btnGet').click()`);
  ok(await until(async () => (await ticked()).length === 1), 'click "<- Send Words to Clues": grid word ticked on Clues page');
  ok(JSON.stringify(await ticked()) === '["alpha"]', 'only the real puzzle word was ticked (the non-clue was ignored)');
  ok(await inClues(`document.getElementById('totalOnCount').textContent`) === '1', 'showAll() refreshed the Clues page counters');
  await ui(`be.action('reloadClues')`);
  ok(await until(async () => JSON.stringify(await ticked()) === '["alpha"]'), 'Clues reloads without a confirmation and restores the checked words');
  ok(await until(() => engine.state.puzzleMatch === true), 'grid letters confirm a match despite the incorrect Clues puzzle number');
  await inClues(`document.querySelector('#clue-grid img').src='z.gif'`); await engine.tick();
  ok(await until(async () => await ui(`document.querySelector('#btnGet').disabled && document.querySelector('#btnSend').disabled && !document.querySelector('#recovery').hidden`)), 'mismatched puzzles disable both transfer buttons and show recovery actions');
  ok((await engine.sendToBabble()).skipped, 'mismatched bulk transfer is also refused by the engine');
  await inClues(`document.querySelector('#clue-grid img').src='b.gif'`); await engine.tick();
  ok(await until(async () => await ui(`!document.querySelector('#btnGet').disabled`)), 'transfer becomes available after the matching puzzle returns');

  /* 4 ---- Lickety Add box (real window, real key events) */
  ctx.setAddVisible(true);
  const add = () => ctx.getAddWindow();
  ok(await until(() => add() && add().isVisible() && !add().webContents.isLoading()), 'Add box opens as its own window');
  ok(add().isAlwaysOnTop(), 'Add box is always on top');
  add().webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F1' });
  add().webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F1' });
  ok(await until(() => getHelp() && !getHelp().webContents.isLoading()), 'F1 also opens Help from Lickety Add');
  getHelp().close();
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
  await key('bravo'); ok(await until(async () => await bg() === 'rgb(255, 204, 1)', 1200, 25), 'amber flash when already ticked');
  ok((await grid()).filter(w => w === 'bravo').length === 1, '...and it is not sent to Babble twice');
  await sleep(1000);
  await key('zzzzz'); await sleep(250); ok(await bg() === 'rgb(151, 0, 0)', 'red flash for a word that is not a clue');
  ok(await add().webContents.executeJavaScript(`document.getElementById('addResult').textContent.includes('Not accepted by Babble: zzzzz')`), 'Add displays a text explanation as well as a red flash');
  ok(await ui(`document.getElementById('lblWord').textContent.includes('zzzzz')`), 'the latest word result also appears in the top bar');
  await sleep(1000);
  await key('good luck all'); await sleep(250);
  ok(await bg() === 'rgb(103, 151, 172)', 'multi-word text flashes the chat colour');
  ok(await until(async () => (await inBabble(`document.getElementById('chat_log').textContent`)).includes('good luck all')), 'chat message reaches the Babble page chat form');
  await sleep(1000);
  await key('delta', 'ctrlKey:true');
  ok(await until(async () => (await inBabble(`document.getElementById('chat_log').textContent`)).includes('delta')), 'Ctrl+Enter forces a single word to Chat');
  ok(!(await ticked()).includes('delta'), '...without touching the Clues page');
  await ui(`document.getElementById('btnHistory').click()`);
  let historyDialog;
  ok(await until(async () => {
    historyDialog = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/history.html'));
    return historyDialog && !historyDialog.webContents.isLoading() && await historyDialog.webContents.executeJavaScript(`document.querySelectorAll('#historyList li').length >= 5`);
  }), 'Entries opens a separate dialog without consuming puzzle space');
  const chatEntry = engine.history.find(entry => entry.kind === 'chat' && entry.text === 'good luck all');
  const chatsBeforeRestore = await inBabble(`document.getElementById('chat_log').children.length`);
  await historyDialog.webContents.executeJavaScript(`be.action('restoreEntry', ${chatEntry.id})`);
  ok(await until(async () => (await val()) === 'good luck all'), 'a chat draft can be restored from history');
  ok(await inBabble(`document.getElementById('chat_log').children.length`) === chatsBeforeRestore, 'restoring a chat draft does not resend it');
  const rejectedEntry = engine.history.find(entry => entry.word === 'zzzzz');
  await ui(`be.action('retryEntry', ${rejectedEntry.id})`);
  ok(await until(async () => await add().webContents.executeJavaScript(`document.getElementById('addResult').textContent.includes('Not accepted by Babble: zzzzz')`)), 'an explicit word retry updates the Add result text');
  ok(await val() === 'good luck all', 'retrying a word does not overwrite an unrelated restored chat draft');
  historyDialog.close();

  /* 5 ---- Clues -> Babble button */
  await inClues(`AddBabbleWord('charlie')`);
  await ui(`document.querySelector('#btnSend').click()`);
  ok(await until(async () => (await grid()).includes('charlie')), 'click "Send Words to Babble ->": ticked Clues word arrives in the grid');
  const g = await grid(); ok(new Set(g).size === g.length, 'no duplicates in the grid: ' + g.join(','));
  ok(await until(() => engine.state.remaining === '2'), 'words-left counter follows the page: ' + engine.state.remaining);
  ok((await add().webContents.executeJavaScript(`document.getElementById('lblRemaining').textContent`)) === '2', 'Add box shows words left');

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
  ok(await until(() => views.res.getBounds().width === 110), 'Word list keeps a compact pane with room for resource controls: ' + views.res.getBounds().width + 'px');
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
  ok(telemetryEvents.filter(event => /Fireworks/.test(event.item || '')).length === 1, 'automatic puzzle-completion Fireworks does not report puzzle activity');
  ok(await ui(`document.getElementById('resTitle').hidden && document.getElementById('resOpen').hidden && !document.getElementById('resClose').hidden`), 'Fireworks exposes only the right-pane Hide control');
  await inBabble(`window.previousFireworksCanvas=document.getElementById('babble-expert-fireworks')`);
  await views.res.webContents.executeJavaScript(`document.getElementById('sky').click()`);
  ok(await views.res.webContents.executeJavaScript(`document.getElementById('sky').dataset.running === 'true'`), 'clicking the fireworks page restarts the celebration');
  ok(await until(async () => await inBabble(`document.getElementById('babble-expert-fireworks') !== window.previousFireworksCanvas && document.querySelectorAll('#babble-expert-fireworks').length === 1`)), 'replaying restarts the overlays without stacking canvases');
  ok(await until(() => telemetryEvents.filter(event => event.event === 'option' && event.item === 'Fireworks replay').length === 1), 'user-clicked Fireworks replay sends one usage notification');
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
  engine._set({ ready: false });
  views.babble.webContents.emit('before-input-event', {}, { type: 'keyDown', key: 'F8', code: 'F8' });
  await sleep(60);
  ok(await views.res.webContents.executeJavaScript(`document.getElementById('canvas').dataset.interaction === 'word'`), 'Babble keystrokes stay out of resources while the puzzle is not ready');
  engine._set({ ready: true });
  views.babble.webContents.emit('before-input-event', {}, { type: 'keyDown', key: 'F8', code: 'F8' });
  ok(await until(async () => (await views.res.webContents.executeJavaScript(`document.getElementById('canvas').dataset.interaction`)) === 'key'), 'signed-in Babble keystrokes still reach interactive resources');
  ctx.sendResourceInteraction({ type: 'key', key: 'x', code: 'KeyX' });
  ok(await until(async () => (await views.res.webContents.executeJavaScript(`document.getElementById('canvas').dataset.interaction`)) === 'key'), 'Chill Vibes accepts gentler relayed Expert key presses');
  ctx.hideResources(); ok(await until(async () => (await ui(`document.getElementById('resPane').hidden`))), 'Hide Resources closes it');

  let installRequests = 0, updateChecks = 0;
  let checkOptions;
  ctx.setUpdateActions({ install: () => { installRequests++; }, check: options => { updateChecks++; checkOptions = options; } });
  ctx.setUpdateState({ phase: 'ready', version: '9.9.9' });
  engine.status('A normal word result');
  ok(await until(async () => await ui(`!document.getElementById('btnInstallUpdate').hidden && document.getElementById('updateStatus').textContent.includes('9.9.9')`)), 'update readiness stays visible separately from normal action messages');
  await ui(`document.getElementById('btnInstallUpdate').click()`);
  ok(await until(() => installRequests === 1), 'persistent Install and restart button invokes the downloaded update action');
  ctx.setUpdateState({ phase: 'error' });
  ok(await until(async () => await ui(`document.getElementById('btnInstallUpdate').hidden && document.getElementById('btnDownloadUpdate').hidden && document.getElementById('btnReleaseNotes').hidden && document.getElementById('updateStatus').hidden`)), 'no update buttons or status use space when no new version is available');
  await ui(`be.action('checkUpdates')`);
  ok(await until(() => updateChecks === 1), 'Check updates remains available after an update error');
  ok(checkOptions?.manual === true, 'the manual action explicitly requests visible feedback');
  ctx.setUpdateState({ phase: 'checking', manual: true });
  ok(await until(async () => await ui(`!document.getElementById('updateStatus').hidden && document.getElementById('updateStatus').textContent.includes('Checking for updates')`)), 'manual checks visibly indicate that work is in progress');
  ctx.setUpdateState({ phase: 'current', manual: true, currentVersion: '3.2.1' });
  ok(await until(async () => await ui(`!document.getElementById('updateStatus').hidden && document.getElementById('updateStatus').textContent.includes('up to date') && document.getElementById('updateStatus').textContent.includes('3.2.1') && document.getElementById('btnInstallUpdate').hidden`)), 'up-to-date feedback includes the installed version without extra update buttons');
  if (process.env.SHOT_DIR) fs.writeFileSync(path.join(process.env.SHOT_DIR, 'update-current.png'), (await win.webContents.capturePage()).toPNG());
  ok(await until(async () => await ui(`document.getElementById('updateStatus').hidden`), 17000), 'manual-check results clear after 15 seconds despite routine state refreshes');
  ctx.setUpdateState({ phase: 'error', manual: true, message: 'Could not check for updates. Try again later.' });
  ok(await until(async () => await ui(`!document.getElementById('updateStatus').hidden && document.getElementById('updateStatus').textContent.includes('Try again later')`)), 'a failed manual check is visible instead of appearing to do nothing');
  ctx.setUpdateState({ phase: 'current', manual: false });
  ok(await until(async () => await ui(`document.getElementById('updateStatus').hidden`)), 'routine background checks remain quiet');
  ctx.setUpdateState({ phase: 'downloading', version: '9.9.9', percent: 42 });
  ok(await until(async () => await ui(`!document.getElementById('updateStatus').hidden && document.getElementById('updateStatus').textContent.includes('42%')`)), 'download progress is visible in the existing toolbar');
  ctx.setUpdateState({ phase: 'ready', version: '9.9.9' });
  ok(await until(async () => await ui(`document.getElementById('updateStatus').title.includes('silently without reopening')`)), 'ready tooltip explains what happens when Expert closes');
  win.webContents.send('update', { phase: 'idle', sequence: 999, launchNotice: { version: '9.9.9.0', updated: true } });
  ok(await until(async () => await ui(`!document.getElementById('updateStatus').hidden && document.getElementById('updateStatus').textContent.includes('Updated successfully to 9.9.9.0')`)), 'the first launch after an upgrade confirms the running version');
  if (process.env.SHOT_DIR) fs.writeFileSync(path.join(process.env.SHOT_DIR, 'update-complete.png'), (await win.webContents.capturePage()).toPNG());
  ctx.setUpdateState({ phase: 'development' });
  views.babble.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  ok(await until(async () => await ui(`!document.getElementById('recovery').hidden && document.getElementById('chip').textContent.includes('stopped responding')`)), 'a crashed Babble pane shows specific recovery controls');
  views.babble.webContents.emit('responsive'); await engine.tick();

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
      const maximized = win.isMaximized(), oldBounds = win.getBounds();
      win.unmaximize(); win.setSize(800, 600);
      ctx.setUpdateState({ phase: 'ready', version: '9.9.9' });
      await sleep(300);
      ok(await ui(`document.documentElement.scrollWidth <= innerWidth && !document.getElementById('statusbar') && !document.getElementById('recentEntries')`), 'compact toolbar has no extra status or history rows');
      fs.writeFileSync(path.join(out, 'compact-toolbar.png'), (await win.webContents.capturePage()).toPNG());
      ctx.setUpdateState({ phase: 'development' });
      if (maximized) win.maximize(); else win.setBounds(oldBounds);
    }
  } catch (e) { console.log('screenshot skipped:', e.message); }

  /* Native page entries, paste and grid clicks work without either transfer button. */
  await engine.whenIdle();
  await inBabble("document.querySelector('#word_list tbody').replaceChildren(); left=4; document.getElementById('total_words_left').textContent='4'");
  await inClues("ticked=[]; showAll()");
  await sleep(700); // Establish an empty accepted-word baseline.
  await inClues("const entry=document.forms.myForm.addWord; entry.focus(); entry.value='brav'; entry.dispatchEvent(new Event('input',{bubbles:true}))");
  ok(await until(async () => await inBabble("document.querySelector('.be-live').dataset.tiles === '4'")), 'pasted Clues entry highlights the Babble grid');
  await inClues("document.forms.myForm.addWord.value=''; document.querySelector('#clue-grid img').click()");
  ok(await until(async () => await inBabble("window.__babbleExpertGlow.getWord() === 'b'")), 'legacy Clues tile clicks highlight the typed letters');
  await inClues("document.forms.myForm.edt1.value='alpha'; document.forms.myForm.edt1.dispatchEvent(new Event('input',{bubbles:true}))");
  ok(await until(async () => await inBabble("window.__babbleExpertGlow.getWord() === 'alpha'")), 'individual clue answer inputs highlight the grid');
  await inClues("document.forms.myForm.addWord.value='bravo'; document.forms.myForm.requestSubmit()");
  ok(await until(async () => (await grid()).includes('bravo')), 'Clues native Add automatically sends its accepted word to Babble');
  await inBabble("const entry=document.forms.add_word.elements.word; entry.value='alpha'; entry.dispatchEvent(new Event('input',{bubbles:true})); document.forms.add_word.requestSubmit()");
  ok(await until(async () => (await ticked()).includes('alpha')), 'Babble native Add automatically sends its accepted word to Clues');
  await inBabble("document.forms.add_word.elements.word.value=''; document.querySelectorAll('#left_column img')[10].click(); document.querySelectorAll('#left_column img')[11].click(); document.querySelectorAll('#left_column img')[12].click(); document.querySelectorAll('#left_column img')[13].click(); document.querySelectorAll('#left_column img')[14].click()");
  ok(await inBabble("document.forms.add_word.elements.word.value === 'delta' && document.querySelector('.be-live').dataset.tiles === '5'"), 'Babble tile clicks build the word and highlight its path');
  await inBabble("document.forms.add_word.requestSubmit()");
  ok(await until(async () => (await ticked()).includes('delta')), 'a word built by clicking Babble tiles automatically reaches Clues');
  await sleep(700);
  ok((await grid()).filter(w => w === 'delta').length === 1, 'automatic forwarding does not echo a word back into Babble');
  ctx.patch({ highlightEntry: false });
  await inBabble("document.forms.add_word.elements.word.value=''; document.querySelectorAll('#left_column img')[0].click()");
  ok(await inBabble("document.forms.add_word.elements.word.value === 'b'"), 'clickable tiles still enter letters with highlighting switched off');
  ctx.patch({ highlightEntry: true });

  /* Grid clicks recover after old paths, resource submissions, and replaced tiles. */
  await inBabble(`document.forms.add_word.elements.word.value=''; document.querySelectorAll('#left_column img')[0].click(); document.querySelectorAll('#left_column img')[1].click(); document.querySelectorAll('#left_column img')[10].click()`);
  ok(await inBabble(`document.forms.add_word.elements.word.value === 'd'`), 'a non-adjacent grid click starts a new word instead of being ignored');
  await inBabble(`document.querySelectorAll('#left_column img')[10].click()`);
  ok(await inBabble(`document.forms.add_word.elements.word.value === ''`), 'clicking the last selected tile removes it from the word');
  await inBabble(`document.forms.add_word.elements.word.value='br'; document.forms.add_word.elements.word.select(); document.querySelectorAll('#left_column img')[10].click(); document.querySelectorAll('#left_column img')[11].click()`);
  ok(await inBabble(`document.forms.add_word.elements.word.value === 'de'`), 'selected entry text is replaced and subsequent clicks extend the new word');
  await key('bravo');
  ok(await until(async () => await inBabble(`document.forms.add_word.elements.word.value === 'bravo'`)), 'a Lickety Add duplicate is still copied into the Babble entry');
  await inBabble(`document.querySelectorAll('#left_column img')[0].click(); document.querySelectorAll('#left_column img')[1].click()`);
  ok(await inBabble(`document.forms.add_word.elements.word.value === 'br'`), 'grid entry starts cleanly after a Lickety Add submission');
  ctx.openResource({ label: 'Test word list', url: base + '/resource.html', width: 90, external: false, showTitle: false, submitWords: true });
  await until(() => !views.res.webContents.isLoading());
  await views.res.webContents.executeJavaScript(`location.hash='submit=zzzzz&nonce=grid-recovery'`);
  ok(await until(async () => await inBabble(`document.forms.add_word.elements.word.value === 'zzzzz'`)), 'a resource word replaces the old Babble draft even when rejected');
  await engine.whenIdle();
  await inBabble(`document.querySelectorAll('#left_column img')[10].click(); document.querySelectorAll('#left_column img')[11].click()`);
  ok(await inBabble(`document.forms.add_word.elements.word.value === 'de'`), 'grid entry works immediately after a rejected resource word');
  await inBabble(`document.querySelector('#left_column').innerHTML=document.querySelector('#left_column').innerHTML; document.forms.add_word.elements.word.value=''; document.querySelectorAll('#left_column img')[0].click()`);
  ok(await inBabble(`document.forms.add_word.elements.word.value === 'b'`), 'grid clicks recover after the page replaces its tile elements');
  ctx.hideResources();

  ctx.selectClueSource('selfServe');
  ok(await until(async () => views.clues.webContents.getURL().endsWith('/selfserve.html') && (await ticked()).length === 3), 'switching to Self Serve automatically imports all accepted Babble words');
  ok(telemetryEvents.filter(event => event.item === 'Clues: Self Serve Clues').length === 1, 'switching to Self Serve sends one option notification');
  await inClues(`(()=>{const totals=document.createElement('div'); totals.className='totals'; totals.textContent='Total: 4'; document.body.append(totals); const button=document.createElement('button'); button.className='grabgrid'; button.textContent='Grab Grid'; button.style.cssText='position:fixed;top:0;right:0'; document.body.append(button); button.click();})()`);
  await sleep(100);
  ok(!telemetryEvents.some(event => event.item === 'Self Serve: Grab Grid'), 'scripted Grab Grid clicks do not send usage notifications');
  const grabPoint = await inClues(`(()=>{const r=document.querySelector('button.grabgrid').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  views.clues.webContents.sendInputEvent({ type: 'mouseDown', ...grabPoint, button: 'left', clickCount: 1 });
  views.clues.webContents.sendInputEvent({ type: 'mouseUp', ...grabPoint, button: 'left', clickCount: 1 });
  ok(await until(() => telemetryEvents.filter(event => event.item === 'Self Serve: Grab Grid').length === 1), 'manual Grab Grid click sends one option notification');
  ctx.selectClueSource('lickety');
  ok(await until(async () => views.clues.webContents.getURL().endsWith('/clues.html') && (await ticked()).length === 3), 'switching back to empty Lickety clues automatically restores all Babble words');
  ctx.selectClueSource('lickety');
  ok(telemetryEvents.filter(event => event.item === "Clues: Lickety's Clues").length === 1, 'switching to Lickety notifies once; reselecting the current source stays quiet');

  /* Update installation must save settings and close Add instead of hiding it. */
  await ctx.prepareForUpdate();
  const updateSaved = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  ok(!!updateSaved.window && updateSaved.add.visible, 'update preparation saves window settings and Add visibility before restart');
  ok(telemetryEvents.filter(event => event.event === 'session').length === 1, 'update preparation finalizes the opted-in session once');
  const closingAdd = add();
  closingAdd.close();
  ok(await until(() => closingAdd.isDestroyed()), 'Lickety Add closes for update installation instead of preventing shutdown');

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  server.close(); app.exit(failures ? 1 : 0);
}).catch(e => { console.error('E2E crashed', e); app.exit(2); });
