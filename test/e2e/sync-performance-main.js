'use strict';
// Count real word-list DOM reads rather than asserting a hardware-specific time.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { Engine } = require('../../src/engine');
const { makePages } = require('../../src/pages');
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'be-sync-performance-')));
setTimeout(() => { console.error('Sync performance check timed out'); app.exit(1); }, 30000).unref();
app.whenReady().then(async () => {
  const server = http.createServer((req, res) => {
    const name = req.url === '/babble' ? 'babble.html' : req.url === '/clues' ? 'clues.html' : null;
    if (!name) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(fs.readFileSync(path.join(__dirname, 'fixtures', name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const options = { show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } };
  const babble = new BrowserWindow(options), clues = new BrowserWindow(options);
  const words = Array.from({ length: 500 }, (_, i) => 'word' + [0, 1, 2].map(power => String.fromCharCode(97 + Math.floor(i / 26 ** power) % 26)).join(''));
  try {
    await Promise.all([babble.loadURL(base + '/babble'), clues.loadURL(base + '/clues')]);
    await babble.webContents.executeJavaScript(`document.querySelector('#word_list tbody').innerHTML=${JSON.stringify(words.map(word => '<tr><td class="word">' + word + '</td></tr>').join(''))};document.getElementById('total_words_left').textContent='10';window.addCalls=0;window.AddWord=()=>{window.addCalls++;};void 0;`);
    await clues.webContents.executeJavaScript(`puzzle=${JSON.stringify(words)};ticked=puzzle.slice();void 0;`);
    const pages = makePages({ getBabble: () => babble.webContents, getClues: () => clues.webContents,
      babbleHosts: ['127.0.0.1'], cluesHosts: ['127.0.0.1'], allowLocal: true });
    const engine = new Engine({ pages, observeProgress: () => true, now: () => 0, pace: 0 });
    await engine.tick(); await engine.syncNativeWords();
    await babble.webContents.executeJavaScript(`window.wordScans=0;const query=document.querySelectorAll.bind(document);document.querySelectorAll=function(selector){if(selector==='#word_list td.word')window.wordScans++;return query(selector);};void 0;`);
    async function measure(reuse) {
      await babble.webContents.executeJavaScript('window.wordScans=0');
      const started = performance.now();
      for (let cycle = 0; cycle < 30; cycle++) { const observation = await engine.tick(); await engine.syncNativeWords(reuse ? observation : undefined); }
      return { ms: Math.round((performance.now() - started) * 10) / 10, wordListScans: await babble.webContents.executeJavaScript('window.wordScans') };
    }
    const previous = await measure(false), current = await measure(true);
    assert.equal(previous.wordListScans, 60); assert.equal(current.wordListScans, 30);
    assert.equal(await babble.webContents.executeJavaScript('window.addCalls'), 0, 'Measuring and reusing observations never submit words');
    assert.equal(await babble.webContents.executeJavaScript("document.getElementById('total_words_left').textContent"), '10');
    assert.equal((await pages.clues.getAllWords()).length, words.length);
    assert.equal(engine.state.words, undefined);
    console.log(JSON.stringify({ result: 'PASS: same-poll observation halves accepted-word DOM reads while retaining both lists without submission', words: words.length, cycles: 30, previous, current }));
  } finally { babble.destroy(); clues.destroy(); server.close(); }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
