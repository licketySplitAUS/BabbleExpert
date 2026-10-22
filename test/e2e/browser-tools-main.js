'use strict';
const { app, session, Menu } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const { browserToolsTemplate } = require('../../src/browser-tools');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-browser-tools-'));
app.setPath('userData', dir);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 100; i++) { try { if (await fn()) return; } catch {} await sleep(100); }
  throw new Error('Timed out waiting for page');
}
app.whenReady().then(async () => {
  const ses = session.fromPartition('persist:babble');
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/babble.html'), 'utf8');
  const page = request => {
    const url = new URL(request.url);
    if (url.pathname === '/return-redirect') return new Response(null, { status: 302, headers: { location: 'http://www.playbabble.com/?redirect=1' } });
    return new Response(url.hostname.includes('playbabble.com') ? fixture : '<html><body>Other site</body></html>', { headers: { 'content-type': 'text/html' } });
  };
  await ses.protocol.handle('http', page);
  await ses.protocol.handle('https', page);
  const ctx = createApp({ userDataDir: dir, telemetryPrompt: false, telemetryEndpoint: null, tourPrompt: false,
    urls: { clues: 'https://clues.test/' } });
  const wc = ctx.views.babble.webContents;
  await until(() => wc.getURL() === 'https://playbabble.com/' && !wc.isLoading());
  await until(() => !ctx.win.webContents.isLoading());
  const build = Menu.buildFromTemplate;
  let options;
  try {
    Menu.buildFromTemplate = template => { options = template; return { popup() {} }; };
    await ctx.win.webContents.executeJavaScript(`be.menu('options',0,0)`);
    await until(() => !!options);
    const tools = options.find(item => item.label === 'Browser tools');
    assert.deepEqual(tools.submenu.map(item => item.label), ['Babble', 'Clues']);
    // Also let Electron validate the complete real native menu template.
    Menu.buildFromTemplate = build;
    Menu.buildFromTemplate(options);
    console.log('PASS Options builds a valid native Browser tools menu for the open panes');
  } finally { Menu.buildFromTemplate = build; }
  await ses.cookies.set({ url: 'https://playbabble.com/', name: 'login-test', value: 'kept' });
  await wc.executeJavaScript(`location.href='http://www.ironsudoku.com/'`);
  await until(() => wc.getURL() === 'http://www.ironsudoku.com/' && !wc.isLoading());
  await wc.executeJavaScript(`document.body.innerHTML='<a id="back" href="http://www.playbabble.com/?return=1#game">Babble</a>';document.getElementById('back').click()`);
  await until(() => wc.getURL() === 'https://playbabble.com/?return=1#game' && !wc.isLoading());
  assert.match(await wc.executeJavaScript('document.cookie'), /login-test=kept/);
  console.log('PASS Sudoku return uses canonical Babble address and retains host-only login cookie');
  await ctx.views.clues.webContents.executeJavaScript(`window.open('http://www.playbabble.com/?popup=1')`);
  await until(() => wc.getURL() === 'https://playbabble.com/?popup=1' && !wc.isLoading());
  console.log('PASS Babble popup from another pane returns to the existing Babble session');

  let response = 0;
  const dialog = { showMessageBox: async () => ({ response }) };
  const menu = () => browserToolsTemplate({ panes: [{ label: 'Babble', wc, home: ctx.refreshBabble, sessionLabel: 'Babble and Clues (shared)' }],
    win: ctx.win, dialog, status: () => {} })[0].submenu;
  const click = prefix => menu().find(item => item.label?.startsWith(prefix)).click();
  await click('Back');
  await until(() => wc.getURL() === 'https://playbabble.com/?return=1#game' && !wc.isLoading());
  await click('Forward');
  await until(() => wc.getURL() === 'https://playbabble.com/?popup=1' && !wc.isLoading());
  console.log('PASS Back and Forward navigate the selected pane');
  await wc.executeJavaScript(`localStorage.setItem('saved','yes'); sessionStorage.setItem('draft','yes')`);
  await ses.cookies.set({ url: 'https://clues.test/', name: 'unrelated', value: 'keep' });
  await click('Clear cached');
  assert.equal((await ses.cookies.get({ name: 'login-test' })).length, 1);
  assert.equal(await wc.executeJavaScript(`localStorage.getItem('saved')`), 'yes');
  await click('Reload current page ignoring');
  await until(() => !wc.isLoading());
  assert.equal(wc.getURL(), 'https://playbabble.com/?popup=1');
  await click('Reset');
  assert.equal((await ses.cookies.get({ name: 'login-test' })).length, 1);
  response = 1;
  await click('Reset');
  await until(() => !wc.isLoading());
  assert.equal((await ses.cookies.get({ name: 'login-test' })).length, 0);
  assert.equal((await ses.cookies.get({ name: 'unrelated' })).length, 1);
  assert.equal(await wc.executeJavaScript(`localStorage.getItem('saved')`), null);
  assert.equal(await wc.executeJavaScript(`sessionStorage.getItem('draft')`), null);
  await click('Return');
  await until(() => wc.getURL() === 'https://playbabble.com/' && !wc.isLoading());
  await wc.executeJavaScript(`location.href='https://www.ironsudoku.com/return-redirect'`);
  await until(() => wc.getURL() === 'https://playbabble.com/?redirect=1' && !wc.isLoading());
  console.log('PASS redirected Babble links also use the canonical address');
  console.log('PASS cache clearing keeps login; confirmed reset clears only the selected site; reload and return work');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
