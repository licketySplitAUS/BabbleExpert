'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict');
for (const method of ['show', 'showInactive', 'focus', 'maximize']) BrowserWindow.prototype[method] = function () {};
app.disableHardwareAcceleration();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'be-next-clue-'));
app.setPath('userData', profile);
app.on('web-contents-created', (_event, wc) => wc.setBackgroundThrottling(false));
const { createApp } = require('../../src/app');
const resources = require('../../src/resources');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 160; i++) { try { if (await fn()) return; } catch {} await sleep(50); }
  throw new Error('Timed out waiting for next clue');
}
setTimeout(() => { console.error('Next-clue test timed out'); app.exit(1); }, 40000).unref();
app.whenReady().then(async () => {
  const source = process.env.WORD_LIST_DIR;
  assert.ok(source, 'Set WORD_LIST_DIR to the hosted word-list source');
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1);
    const file = /^words-(?:[4-9]|1[0-2])\.html$/.test(name) ? path.join(source, name)
      : path.join(__dirname, 'fixtures', name === 'babble.html' ? 'babble.html' : 'clues.html');
    res.setHeader('content-type', 'text/html'); res.end(fs.readFileSync(file, 'utf8').replace(/<link\b[^>]*>/gi, ''));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${server.address().port}`;
  const ctx = createApp({ userDataDir: profile, tourPrompt: false, telemetryPrompt: false, telemetryEndpoint: null,
    urls: { babble: base + '/babble.html', clues: base + '/clues.html' }, hosts: { babble: ['localhost'], clues: ['localhost'] }, pace: 0 });
  const run = code => ctx.views.res.webContents.mainFrame.executeJavaScript(code);
  const clues = code => ctx.views.clues.webContents.executeJavaScript(code);
  const ui = code => ctx.win.webContents.executeJavaScript(code);
  const activeName = () => clues(`document.querySelector('[data-babble-expert-active-clue] input[name^="edt"]')?.name`);
  const ready = length => until(async () => ctx.views.res.webContents.getURL().includes(`words-${length}.html`) &&
    ctx.views.res.getVisible() && await ui(`document.getElementById('resLoading').hidden`));
  try {
    await until(() => ctx.engine.state.ready && ctx.engine.state.puzzleMatch === true);
    await clues(`document.body.insertAdjacentHTML('beforeend', '<table id="navigation-clues" style="margin:1200px 0"><tr><td>ra4,5</td><td><input type="checkbox" checked><input name="edt900" value="rats"></td></tr><tr><td>ra6,18</td><td><input type="checkbox"><input name="edt901" value="ra"></td></tr><tr><td>ra6,18</td><td><input type="checkbox" checked><input name="edt902" value="ratter"></td></tr><tr><td>re5,10</td><td><input type="checkbox"><input name="edt903" value="re"></td></tr><tr><td>re5,10</td><td><input type="checkbox" checked><input name="edt904" value="reefs"></td></tr><tr><td>st7,40</td><td><input type="checkbox"><input name="edt905" value="st"></td></tr></table>');window.GetAllWords=()=>['rats','ratter','reefs'].join(String.fromCharCode(10));void 0`);
    ctx.openResource({ ...resources.find(item => item.wordLength === 4), url: base + '/words-4.html' });
    await ready(4);
    assert.equal(await run(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'n',bubbles:true,cancelable:true}))`), false);
    await ready(6); await until(async () => await activeName() === 'edt901');
    assert.equal(await run(`window.__babbleExpertWordList.middleWord()`), 'rattan', 'First N selects the first unfinished clue and its bounded dictionary candidate');
    assert.ok(await clues(`(()=>{const r=document.querySelector('[data-babble-expert-active-clue]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`), 'Selected clue is scrolled into view');
    assert.equal(await run(`document.querySelector('.find').focus();document.querySelector('.find').dispatchEvent(new KeyboardEvent('keydown',{key:'n',bubbles:true,cancelable:true}))`), true, 'N remains normal typing in resource search');
    assert.equal(await run(`document.querySelector('.find').dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true,cancelable:true}))`), true, 'P remains normal typing in resource search');
    assert.equal(await run(`document.querySelector('.find').dispatchEvent(new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true}))`), true, 'Search retains its editing context menu');
    assert.equal(await run(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,bubbles:true,cancelable:true}))`), true, 'Modified N is not captured');
    await run(`document.querySelector('.find').blur();document.querySelector('.w').dispatchEvent(new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true}))`);
    await ready(5); await until(async () => await activeName() === 'edt903');
    assert.match(await run(`window.__babbleExpertWordList.middleWord()`), /^re/, 'Right-click in Resources skips completed clues and changes length');
    await clues(`document.querySelector('[name="edt903"]').closest('tr').cells[0].dispatchEvent(new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true}))`);
    await ready(7); await until(async () => await activeName() === 'edt905');
    assert.match(await run(`window.__babbleExpertWordList.middleWord()`), /^st/, 'Right-click in Clues positions both panes');
    assert.equal(await clues(`document.querySelector('[name="edt905"]').dispatchEvent(new KeyboardEvent('keydown',{key:'n',bubbles:true,cancelable:true}))`), true, 'N remains normal typing in clue answers');
    assert.equal(await clues(`document.querySelector('[name="edt905"]').dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true,cancelable:true}))`), true, 'P remains normal typing in clue answers');
    assert.equal(await clues(`document.querySelector('[name="edt905"]').dispatchEvent(new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true}))`), true, 'Clue inputs retain editing menus');
    await run(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true,cancelable:true}))`);
    await ready(5); await until(async () => await activeName() === 'edt903');
    assert.match(await run(`window.__babbleExpertWordList.middleWord()`), /^re/, 'P in Resources positions the previous unfinished clue');
    await clues(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true,cancelable:true}))`);
    await ready(6); await until(async () => await activeName() === 'edt901');
    await ui(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true,cancelable:true}))`);
    await ready(7); await until(async () => await activeName() === 'edt905');
    assert.match(await ui(`document.getElementById('lblWord').textContent`), /last unfinished/, 'P wraps to the last unfinished clue');
    await clues(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'n',bubbles:true,cancelable:true}))`);
    await ready(6); await until(async () => await activeName() === 'edt901');
    assert.match(await ui(`document.getElementById('lblWord').textContent`), /first unfinished/);
    // Simulate Self Serve's Off view removing the row just completed.
    await clues(`document.getElementById('navigation-clues').innerHTML='<tr><td>aa4,4</td><td><input type="checkbox"><input class="answer" data-answer-word="AAHS" value="aa"></td></tr><tr><td>ra6,18</td><td><input type="checkbox"><input class="answer" data-answer-word="RATTAN" value="ra"></td></tr><tr><td>re5,10</td><td><input type="checkbox"><input class="answer" data-answer-word="REACH" value="re"></td></tr>';document.querySelector('[data-answer-word="RATTAN"]').click()`);
    await until(() => clues(`!!document.querySelector('[data-babble-expert-active-clue] [data-answer-word="RATTAN"]')`));
    await until(() => ui(`document.getElementById('resLoading').hidden`));
    await clues(`document.querySelector('[data-answer-word="RATTAN"]').closest('tr').remove()`);
    await run(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'n',bubbles:true,cancelable:true}))`);
    await ready(5);
    await until(() => clues(`!!document.querySelector('[data-babble-expert-active-clue] [data-answer-word="REACH"]')`));
    await clues(`document.querySelector('[data-answer-word="REACH"]').closest('tr').remove()`);
    await run(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'p',bubbles:true,cancelable:true}))`);
    await ready(4);
    await until(() => clues(`!!document.querySelector('[data-babble-expert-active-clue] [data-answer-word="AAHS"]')`));
    await clues(`document.querySelector('#navigation-clues input[type="checkbox"]').checked=true`);
    await ui(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'n',bubbles:true,cancelable:true}))`);
    await until(() => ui(`/No unfinished/.test(document.getElementById('lblWord').textContent)&&document.getElementById('resLoading').hidden`));
    assert.equal((await ctx.engine.pages.babble.words()).length, 2, 'Advancing never submits a resource candidate');
    ctx.hideResources(); await sleep(80);
    assert.equal(await clues(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'n',bubbles:true,cancelable:true}))`), true, 'Shortcut turns off when word resources are closed');
    console.log('PASS: N/P and right-click in both panes, skipped completed clues, wrap in both directions, bounded candidates, Off-view removal, normal editing and no word submissions');
  } finally { server.close(); }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
