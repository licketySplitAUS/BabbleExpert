'use strict';
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { createApp } = require('../../src/app');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'be-add-safety-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await sleep(50); }
  throw Error('Timed out waiting for Add');
}
const deadline = setTimeout(() => app.exit(1), 30000);
app.whenReady().then(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(fs.readFileSync(path.join(__dirname, 'fixtures', req.url === '/babble.html' ? 'babble.html' : 'clues.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${server.address().port}`;
  const ctx = createApp({ userDataDir: profile, tourPrompt: false, telemetryPrompt: false, telemetryEndpoint: null,
    urls: { babble: base + '/babble.html', clues: base + '/clues.html' },
    hosts: { babble: ['localhost'], clues: ['localhost'] }, pace: 0 });
  try {
    await until(() => ctx.engine.state.ready && ctx.engine.state.cluesOk);
    ctx.setAddVisible(true);
    await until(() => ctx.getAddWindow() && !ctx.getAddWindow().webContents.isLoading());
    const run = code => ctx.getAddWindow().webContents.executeJavaScript(code);
    const chat = () => ctx.views.babble.webContents.executeJavaScript(`document.getElementById('chat_log').textContent`);
    const enter = (text, ctrl = false) => run(`(() => {
      const field = document.getElementById('mmoAdd'); field.value = ${JSON.stringify(text)};
      field.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true, ctrlKey:${ctrl}}));
    })()`);
    const value = () => run(`document.getElementById('mmoAdd').value`);
    await enter('good luck all');
    await until(async () => (await chat()).includes('good luck all'));
    assert.equal(await value(), '');
    console.log('PASS normal chat sends with Enter');
    for (const text of ['alpha bravo delta', 'alpha, bravo, charlie, delta', 'alpha\nbravo', 'a'.repeat(501)]) {
      const before = await chat();
      await enter(text);
      assert.equal(await value(), text);
      assert.equal(await chat(), before);
    }
    console.log('PASS suspected lists and unsafe entries stay in Add without reaching chat');
    await enter('alpha bravo delta', true);
    await until(async () => (await chat()).includes('alpha bravo delta'));
    assert.equal(await value(), '');
    const before = await chat();
    await enter('alpha\nbravo', true);
    assert.equal(await value(), 'alpha\nbravo');
    assert.equal(await chat(), before);
    console.log('PASS explicit single-line chat override works; multiline list remains blocked');
  } finally {
    ctx.win.destroy(); server.close();
  }
  clearTimeout(deadline); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
