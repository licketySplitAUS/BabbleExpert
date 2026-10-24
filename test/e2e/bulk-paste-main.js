'use strict';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { createApp } = require('../../src/app');
app.disableHardwareAcceleration();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'be-bulk-paste-'));
app.setPath('userData', profile);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 100; i++) { try { if (await fn()) return; } catch { /* page may still be navigating */ } await sleep(100); }
  throw Error('Timed out waiting for bulk paste');
}
const deadline = setTimeout(() => app.exit(1), 45000);
app.whenReady().then(async () => {
  assert.ok(process.env.REAL_CLUES && process.env.SELFSERVE_DIST, 'Set REAL_CLUES and SELFSERVE_DIST to local hosted sources');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/wordlist') return res.end('AAAA\nAAAAA\nAAAAAA\n');
    if (url.pathname === '/api/grid' || url.pathname === '/api/grab') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ puzzle: '100', letters: 'A'.repeat(25), date: '2026-10-17', changed: true }));
    }
    const file = url.pathname === '/legacy.html' ? process.env.REAL_CLUES
      : url.pathname === '/babble.html' ? path.join(__dirname, 'fixtures/babble.html')
      : path.join(process.env.SELFSERVE_DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.gif') ? 'image/gif' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${server.address().port}`;
  const ctx = createApp({ userDataDir: profile, tourPrompt: false, telemetryPrompt: false, telemetryEndpoint: null,
    urls: { babble: base + '/babble.html', clues: base + '/legacy.html', selfServeClues: base + '/' },
    hosts: { babble: ['localhost'], clues: ['localhost'] }, pace: 0 });
  const wc = ctx.views.clues.webContents;
  const run = code => wc.executeJavaScript(code).catch(error => { throw new Error(code + ": " + error.message); });
  try {
    for (const source of ['lickety', 'selfServe']) {
      if (source === 'selfServe') ctx.selectClueSource(source);
      await until(() => run(`!!document.querySelector('form[name="bulk"]') && typeof window.GetAllWords==="function"`));
      await until(() => run(source === 'lickety' ? 'lTotalWords>0' : `!!document.querySelector('[data-answer-word="AAAA"]')`));
      assert.equal(await run(`getComputedStyle(document.querySelector('form[name="bulk"]')).display`), 'none');
      assert.equal(await run(`[...document.querySelectorAll('a[href$="#BulkAdd" i], a[href$="#BulkGrab" i]')].every(a=>getComputedStyle(a).display==="none")`), true);
      const word = source === 'lickety' ? await run('decrypt(lWordArray[0]).toLowerCase()') : 'aaaa';
      await run('window.AddBabbleWord(' + JSON.stringify(word) + ')');
      assert.ok((await run('window.GetAllWords().toLowerCase()')).includes(word));
      console.log('PASS ' + source + ': embedded bulk tools hidden; word sync API still works');
    }
    // Exercise the websites without Expert's preload or IPC clipboard bridge.
    const browser = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    const page = code => browser.webContents.executeJavaScript(code);
    try {
      for (const source of ['lickety', 'selfServe']) {
        await browser.loadURL(base + (source === 'lickety' ? '/legacy.html' : '/'));
        await until(() => page(source === 'lickety' ? 'typeof lTotalWords!=="undefined" && lTotalWords>0' : `!!document.querySelector('[data-answer-word="AAAA"]')`));
        const words = source === 'lickety' ? await page('lWordArray.slice(0,2).map(w=>decrypt(w).toLowerCase())') : ['aaaa', 'aaaaa'];
        const text = words.join('\n');
        const paste = `(()=>{const button=[...document.querySelectorAll('form[name="bulk"] button, form[name="bulk"] input')].find(b=>/^Paste from Clipboard/.test(b.value||b.textContent));button.click()})()`;
        await page(`window.alert=message=>{window.pasteMessage=message};void Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>${JSON.stringify(text)}}})`);
        await page(paste);
        await until(() => page(`document.querySelector('textarea[name="bulkWords"]').value===${JSON.stringify(text)}`));
        await page(`document.querySelector('form[name="bulk"] button[type="submit"], form[name="bulk"] input[onclick="AddBulkWord();"]').click()`);
        await until(() => page(`${JSON.stringify(words)}.every(w=>window.GetAllWords().toLowerCase().split(/\\s+/).includes(w))`));
        await page(`void(navigator.clipboard.readText=async()=>{throw Error('Permission denied')})`);
        await page(paste);
        await until(() => page(`document.activeElement===document.querySelector('textarea[name="bulkWords"]') && /Cmd\\+V/.test(window.pasteMessage||document.querySelector('.bulkmessage')?.textContent||'')`));
        assert.equal(await page('window.__babbleExpertWordList'), undefined);
        console.log('PASS ' + source + ': standalone browser paste and permission-denied keyboard fallback');
      }
    } finally { browser.destroy(); }
  } finally {
    ctx.win.destroy(); server.close();
  }
  clearTimeout(deadline); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
