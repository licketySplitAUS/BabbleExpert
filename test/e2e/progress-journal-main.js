'use strict';
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
for (const method of ['show', 'showInactive', 'focus', 'maximize']) BrowserWindow.prototype[method] = function () {};
app.disableHardwareAcceleration();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'be-progress-journal-'));
app.setPath('userData', profile); app.on('web-contents-created', (_event, wc) => wc.setBackgroundThrottling(false));
const { createApp } = require('../../src/app'), { ProgressJournal } = require('../../src/progress-journal');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 150; i++) { try { if (await fn()) return; } catch {} await sleep(50); } throw Error('Journal UI timed out'); }
setTimeout(() => { console.error('Journal test timed out'); app.exit(1); }, 40000).unref();
app.whenReady().then(async () => {
  let time = 0, active = true, confirm = 0, prompts = 0;
  const messages = [], exported = path.join(profile, 'export.csv');
  dialog.showMessageBox = async () => { prompts++; return { response: confirm }; };
  dialog.showSaveDialog = async () => { prompts++; return { canceled: false, filePath: exported }; };
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(req.url.startsWith('/babble') ? fs.readFileSync(path.join(__dirname, 'fixtures/babble.html')) : '<body>Clues temporarily unavailable.</body>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${server.address().port}`;
  // Simulate V3.3.0's saved default, before the one-time default-on migration.
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ journalEnabled: false }));
  const ctx = createApp({ userDataDir: profile, telemetryPrompt: false, tourPrompt: false, pace: 0,
    journalNow: () => Date.parse('2026-10-24T00:00:00Z') + time, journalClock: () => time, journalActive: () => active,
    telemetryEndpoint: 'https://example.test/notify', telemetryFetch: async (_url, options) => { messages.push(JSON.parse(options.body)); return { ok: true }; },
    urls: { babble: base + '/babble.html', clues: base + '/clues.html' }, hosts: { babble: ['localhost'], clues: ['localhost'] } });
  const ui = code => ctx.win.webContents.executeJavaScript(code), babble = code => ctx.views.babble.webContents.executeJavaScript(code);
  ctx.views.res.webContents.setAudioMuted(true);
  const file = path.join(profile, 'progress-journal.json');
  try {
    await until(() => ctx.engine.state.ready); assert.equal(ctx.engine.state.cluesOk, false);
    ctx.patch({ usageSharing: true, usageConsentVersion: 3 });
    await babble("Array.from=function(iterable){return Array.prototype.slice.call(iterable);};document.querySelector('#word_list tbody').replaceChildren();left=3;document.getElementById('total_words_left').textContent='3'");
    assert.equal(ctx.journal.enabled, true, 'Journal records by default without opening its window');
    assert.equal(ctx.settings.data.journalEnabled, true);
    ctx.journal.clear();
    await ctx.engine.tick();
    assert.equal(ctx.journal.view().records.length, 1, 'Default recording observes progress before the journal is visited');
    ctx.journal.flush(); assert.equal(fs.existsSync(file), true);
    assert.equal(messages.some(message => message.event === 'option' && message.item === 'Personal progress journal enabled'), false, 'Default recording is not reported as a user enabling the option');
    ctx.patch({ journalEnabled: false }); ctx.journal.clear();
    await ctx.engine.tick(); assert.equal(ctx.journal.view().records.length, 0, 'Paused journal records no puzzle data');
    const beforeOpen = messages.length;
    await ui("be.action('showJournal')");
    await until(() => !!ctx.getJournalWindow() && !ctx.getJournalWindow().webContents.isLoading());
    const win = ctx.getJournalWindow(), run = code => win.webContents.executeJavaScript(code);
    await until(() => run("document.getElementById('recordingState').textContent.includes('paused')"));
    assert.equal(await run("document.getElementById('enabled').checked"), false);
    assert.equal(messages.length, beforeOpen, 'Opening the journal sends no usage notice');
    const before = messages.length;
    await run("document.getElementById('enabled').click()"); await until(() => ctx.journal.enabled);
    assert.deepEqual(messages.slice(before).filter(message => message.event === 'option').map(message => message.item), ['Personal progress journal enabled']);
    await run('journal.enable(true)');
    assert.equal(messages.slice(before).filter(message => message.event === 'option').length, 1, 'Repeated enabled settings send no duplicate notice');
    await ctx.engine.tick(); assert.equal(ctx.journal.view().records.length, 1);
    time += 1000; await babble("AddWord('alpha')"); await ctx.engine.tick();
    time += 1000; active = false; ctx.journal.suspend();
    time += 10000; await ctx.engine.tick(); assert.equal(ctx.journal.view().records[0].activeMs, 2000);
    active = true; await ctx.engine.tick(); time += 1000; await babble("AddWord('bravo')"); await ctx.engine.tick();
    time += 1000; await babble("AddWord('charlie')"); await ctx.engine.tick();
    const row = ctx.journal.view().records[0];
    assert.equal(row.completionObserved, true); assert.equal(row.activeMs, 4000); assert.equal(row.partial, false);
    assert.deepEqual(row.byLength, { 5: 2, 7: 1 });
    // Get fresh data through the same preload bridge used by the real controls.
    await run("journal.get().then(data=>window.latestJournal=data)");
    await until(() => run('window.latestJournal?.records[0]?.found===3'));
    // This fixture keeps the native window hidden; exercise its normal
    // subscription without depending on the visible-window update timer.
    win.webContents.send('journal:changed', ctx.journal.view());
    await until(() => run("document.getElementById('finished').textContent==='1'"));
    await run("document.querySelector('#rows button').click()");
    assert.ok(await run("document.getElementById('longest').textContent.includes('charlie')"));
    assert.equal(await run("document.querySelectorAll('.length-row').length"), 2);
    const shots = path.join(__dirname, '../../artifacts/progress-journal'); fs.mkdirSync(shots, { recursive: true });
    await sleep(100); fs.writeFileSync(path.join(shots, 'desktop.png'), (await win.webContents.capturePage()).toPNG());
    win.setSize(480, 740); await sleep(120);
    assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'), 'Journal fits a narrow window');
    fs.writeFileSync(path.join(shots, 'narrow.png'), (await win.webContents.capturePage()).toPNG());
    await run("document.getElementById('export').click()");
    await until(() => fs.existsSync(exported) && fs.readFileSync(exported, 'utf8').includes('charlie'));
    assert.match(fs.readFileSync(exported, 'utf8'), /charlie/);
    await ctx.prepareForUpdate();
    assert.equal(new ProgressJournal({ file }).view().records[0].found, 3, 'Update/shutdown preparation flushes history');
    await run("document.getElementById('enabled').click()"); await until(() => !ctx.journal.enabled);
    await ctx.engine.tick(); assert.equal(ctx.journal.view().records.length, 1, 'Pausing preserves completed history');
    const hostile = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '../../src/preload-journal.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
    await hostile.loadURL('data:text/html,<body>Untrusted page</body>');
    const priorPrompts = prompts;
    for (const action of ['get()', 'enable(true)', 'clear()', 'export()']) assert.equal(await hostile.webContents.executeJavaScript('journal.' + action), null);
    assert.equal(prompts, priorPrompts); assert.equal(ctx.journal.enabled, false); hostile.destroy();
    confirm = 0; await run("document.getElementById('clear').click()"); await sleep(100); assert.equal(ctx.journal.view().records.length, 1);
    confirm = 1; await run("document.getElementById('clear').click()"); await until(() => ctx.journal.view().records.length === 0);
    assert.equal(new ProgressJournal({ file }).view().records.length, 0, 'Confirmed deletion clears the saved file');
    assert.ok(messages.slice(before).every(message => !JSON.stringify(message).match(/charlie|8097|activeMs|byLength|puzzleId|completedAt/i)), 'Journal records never enter usage notifications');
    assert.deepEqual(messages.slice(before).filter(message => message.event === 'option').map(message => message.item), ['Personal progress journal enabled'], 'Recording, completion, export, pausing and deletion send no extra notices');
    const beforeLayout = messages.length;
    await ui('be.setSettings({resourcesLeft:true})');
    await ui('be.setSettings({resourcesLeft:true,yellow:true})');
    await ui('be.setSettings({resourcesLeft:false})');
    assert.deepEqual(messages.slice(beforeLayout).filter(message => message.event === 'option').map(message => message.item), ['Resources moved to the left'], 'Only a real move left is reported');
    ctx.patch({ usageSharing: false });
    const beforeOptOut = messages.length;
    await ui('be.setSettings({resourcesLeft:true})');
    await run('journal.enable(true)'); await run('journal.enable(false)');
    assert.equal(messages.length, beforeOptOut, 'Both options remain usable with no notifications when sharing is off');
    ctx.patch({ usageSharing: true });
    assert.equal(messages.length, beforeOptOut, 'Opting back in does not replay earlier option changes');
    console.log('PASS: default recording before first visit, pause/resume UI, atomic Babble snapshot without Clues, active timing, completion, word lengths, export, restart, pause, confirmed deletion, trusted IPC, telemetry separation and narrow layout. Screenshots: ' + shots);
    win.destroy(); server.close(); app.exit(0);
  } catch (error) { console.error(error); server.close(); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
