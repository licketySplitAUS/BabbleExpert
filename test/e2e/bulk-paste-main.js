'use strict';
const { app, BrowserWindow, clipboard, ClipboardItem } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { createApp } = require('../../src/app');
app.disableHardwareAcceleration();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'be-bulk-paste-'));
app.setPath('userData', profile);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await sleep(100); }
  throw Error('Timed out waiting for bulk paste');
}
const deadline = setTimeout(() => app.exit(1), 45000);
app.whenReady().then(async () => {
  assert.ok(process.env.REAL_CLUES && process.env.SELFSERVE_DIST, 'Set REAL_CLUES and SELFSERVE_DIST to local hosted sources');
  const savedClipboard = await Promise.all((await clipboard.read()).map(async item =>
    new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
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
  const run = code => wc.executeJavaScript(code);
  async function clickButton() {
    const point = await run(`(()=>{
      const button=[...document.querySelectorAll('form[name="bulk"] button, form[name="bulk"] input')]
        .find(b=>/^Paste from Clipboard/.test(b.value||b.textContent));
      button.scrollIntoView({block:'center'}); const r=button.getBoundingClientRect();
      return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};
    })()`);
    wc.focus();
    wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
  }
  try {
    for (const source of ['lickety', 'selfServe']) {
      if (source === 'selfServe') ctx.selectClueSource(source);
      await until(() => run(`!!document.querySelector('textarea[name="bulkWords"]') && typeof window.AddBulkWord==='function'`));
      await until(() => run(source === 'lickety' ? 'lTotalWords>0' : `!!document.querySelector('[data-answer-word="AAAA"]')`));
      const words = source === 'lickety' ? await run('lCleanWords.slice(0,2).map(w=>w.toLowerCase())') : ['aaaa', 'aaaaa'];
      const text = words.join('\n');
      await clipboard.writeText(text);
      await clickButton();
      await until(() => run(`document.querySelector('textarea[name="bulkWords"]').value===${JSON.stringify(text)}`));
      console.log('PASS ' + source + ': native clipboard button inserts multiline text');
      // The native input event must also update React state, not just the DOM.
      await run(`window.alert=()=>{}; document.querySelector('form[name="bulk"] button[type="submit"], form[name="bulk"] input[onclick="AddBulkWord();"]').click()`);
      await until(() => run(`${JSON.stringify(words)}.every(w=>window.GetAllWords().toLowerCase().split(/\\s+/).includes(w))`));
      console.log('PASS ' + source + ': clipboard button pastes multiline text and Add Bulk accepts it');
      await run(`const field=document.querySelector('textarea[name="bulkWords"]');field.focus();field.select()`);
      wc.focus();
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: [process.platform === 'darwin' ? 'meta' : 'control'] });
      await until(() => run(`document.querySelector('textarea[name="bulkWords"]').value===${JSON.stringify(text)}`));
      console.log('PASS ' + source + ': keyboard paste remains functional');
    }
    // Exercise the websites without Expert's preload or IPC clipboard bridge.
    const browser = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    const page = code => browser.webContents.executeJavaScript(code);
    try {
      for (const source of ['lickety', 'selfServe']) {
        await browser.loadURL(base + (source === 'lickety' ? '/legacy.html' : '/'));
        await until(() => page(source === 'lickety' ? 'typeof lTotalWords!=="undefined" && lTotalWords>0' : `!!document.querySelector('[data-answer-word="AAAA"]')`));
        const words = source === 'lickety' ? await page('lCleanWords.slice(0,2).map(w=>w.toLowerCase())') : ['aaaa', 'aaaaa'];
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
    await clipboard.write(savedClipboard);
    ctx.win.destroy(); server.close();
  }
  clearTimeout(deadline); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
