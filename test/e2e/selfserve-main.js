'use strict';
// Verify the actual Self Serve production bundle with controlled puzzle responses.
// SELFSERVE_DIST must point to its built dist directory.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { makePages } = require('../../src/pages');
app.disableHardwareAcceleration();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await sleep(100); }
  throw new Error('Timed out waiting for Self Serve');
}
app.whenReady().then(async () => {
  const dist = process.env.SELFSERVE_DIST;
  assert.ok(dist && fs.existsSync(path.join(dist, 'index.html')), 'Set SELFSERVE_DIST to the built Self Serve app');
  let puzzle = '100', letters = 'A'.repeat(25), grabs = 0, offline = false;
  const server = http.createServer((req, res) => {
    if (req.url === '/api/wordlist') return res.end('AAAA\nBBBB\n');
    if (req.url === '/api/grab' || req.url === '/api/grid') {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/grab') {
        grabs++;
        if (offline) { res.statusCode = 502; return res.end(JSON.stringify({ error: 'PlayBabble unavailable' })); }
      }
      return res.end(JSON.stringify({ puzzle, letters, date: '2026-10-17', changed: true }));
    }
    const asset = path.join(dist, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!fs.existsSync(asset) || !fs.statSync(asset).isFile()) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(asset));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const run = code => win.webContents.executeJavaScript(code);
  const pages = makePages({ getBabble: () => null, getClues: () => win.webContents, babbleHosts: [], cluesHosts: ['127.0.0.1'] });
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    await win.loadURL(url);
    await until(() => run(`!!document.querySelector('[data-answer-word="AAAA"]')`));
    assert.ok(grabs > 0, 'Opening automatically checks PlayBabble');
    await run(`document.querySelectorAll('input[name="view"]')[1].click()`);
    await until(() => run(`!document.querySelector('[data-answer-word]')`));
    assert.equal((await pages.clues.state()).ready, true, 'Loaded puzzle readiness does not depend on which answers are visible');
    await run(`window.showAll()`);
    await until(() => run(`!!document.querySelector('[data-answer-word="AAAA"]')`));
    assert.equal(await run(`window.AddBabbleWord('aaaa')`), '1');
    await win.loadURL(url);
    await until(() => run(`!!document.querySelector('[data-answer-word="AAAA"]')`));
    assert.equal(await run(`window.AddBabbleWord('aaaa')`), '2', 'Reload preserves added words for this puzzle');
    puzzle = '101'; letters = 'B'.repeat(25);
    const beforeCheck = grabs;
    assert.equal(await pages.clues.ensurePuzzle('A'.repeat(25)), 'current');
    assert.equal(grabs, beforeCheck, 'Matching puzzle never triggers Grab Grid');
    assert.equal(await pages.clues.ensurePuzzle('B'.repeat(25)), 'requested');
    await until(() => run(`!!document.querySelector('[data-answer-word="BBBB"]')`));
    assert.equal(await run(`window.GetAllWords()`), '', 'New puzzle does not inherit old added words');
    assert.equal(await run(`window.AddBabbleWord('bbbb')`), '1', 'New grid accepts its new words');
    assert.equal(await run(`JSON.parse(localStorage.getItem('babblekey-found-100'))[0]`), 'AAAA', 'Previous puzzle words stay saved');
    offline = true;
    await win.loadURL(url);
    await until(() => run(`!!document.querySelector('[data-answer-word="BBBB"]')`));
    assert.equal(await run(`window.AddBabbleWord('bbbb')`), '2', 'Saved grid and found words remain usable when PlayBabble is offline');
    console.log('ALL PASSED: automatic Grab Grid, puzzle rollover, reload persistence, offline fallback');
  } finally { win.destroy(); server.close(); }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
