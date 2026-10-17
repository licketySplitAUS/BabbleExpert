'use strict';
// Hidden, local-only regression: no real credentials or desktop interaction.
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { makeBabbleGlowScript } = require('../../src/babble-glow');
const { findBabbleWordEntry } = require('../../src/babble-entry');
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'be-login-test-')));
const deadline = setTimeout(() => { console.error('Login regression timed out'); app.exit(1); }, 15000);
app.whenReady().then(async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', data => { body += data; });
      req.on('end', () => {
        requests.push({ body: Object.fromEntries(new URLSearchParams(body)), cookie: req.headers.cookie });
        res.end('<p>Local test submission received</p>');
      });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Set-Cookie', 'login_test=preserved; HttpOnly; SameSite=Lax; Path=/');
    res.end(`<form action="/action/log_in" method="post">
      <input type="hidden" name="return_url" value="">
      <label>Email: <input type="text" name="email"></label>
      <label>Password: <input type="password" name="password" maxlength="16"></label>
      <input type="submit" value="Log In"></form>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, partition: 'login-regression' } });
  const wc = win.webContents, run = code => wc.executeJavaScript(code);
  try {
    for (const mode of ['button', 'native-submit']) {
      await wc.loadURL(base + '/log_in');
      console.log('Checking login submission:', mode);
      assert.equal(await run(makeBabbleGlowScript(['127.0.0.1'])), false);
      await run(`document.querySelector('[name=email]').value='test+local@example.invalid'; document.querySelector('[name=password]').value='aB!&+="é9';`);
      await run(`(()=>{const field=(${findBabbleWordEntry.toString()})(document); if(field) field.value='testword';})()`);
      assert.equal(await run(`document.querySelector('[name=email]').value`), 'test+local@example.invalid');
      assert.equal(await run(`document.querySelector('[name=password]').value`), 'aB!&+="é9');
      assert.equal(await run(`!!document.getElementById('babble-expert-glow')`), false);
      const loaded = new Promise(resolve => wc.once('did-finish-load', resolve));
      if (mode === 'button') await run(`document.querySelector('[type=submit]').click()`);
      else {
        await run(`document.querySelector('[name=password]').focus()`);
        // Hidden tests have no OS keyboard focus. Exercise native form
        // submission without synthesizing a desktop Enter key.
        await run(`document.querySelector('form').requestSubmit(document.querySelector('[type=submit]'))`);
      }
      await loaded;
      const posted = requests.at(-1);
      assert.deepEqual(posted.body, { return_url: '', email: 'test+local@example.invalid', password: 'aB!&+="é9' });
      assert.match(posted.cookie, /login_test=preserved/);
    }
    console.log('PASS: hidden Electron login preserves credentials, POST and cookies with button and native form submission');
    clearTimeout(deadline);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
  finally { win.destroy(); server.close(); }
});
