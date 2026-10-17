'use strict';
// Test the hosted word-list HTML supplied through WORD_LIST_DIR, inside Expert.
const { app } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict');
const { createApp } = require('../../src/app');
const resources = require('../../src/resources');
app.disableHardwareAcceleration();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 100; i++) { try { if (await fn()) return; } catch {} await sleep(80); }
  throw new Error('Timed out waiting for word list');
}
app.whenReady().then(async () => {
  const dir = process.env.WORD_LIST_DIR;
  assert.ok(dir && fs.existsSync(path.join(dir, 'words-6.html')), 'Set WORD_LIST_DIR to the hosted word-list source');
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1);
    const file = /^words-(?:[4-9]|1[0-2])\.html$/.test(name) ? path.join(dir, name)
      : path.join(__dirname, 'fixtures', name === 'babble.html' ? 'babble.html' : 'clues.html');
    res.setHeader('content-type', 'text/html'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${server.address().port}`;
  const notifications = [];
  const ctx = createApp({ tourPrompt: false, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'be-word-list-')), telemetryPrompt: false,
    telemetryEndpoint: 'https://example.test/notify', telemetryFetch: async (_url, options) => {
      notifications.push(JSON.parse(options.body)); return { ok: true };
    }, urls: { babble: base + '/babble.html', clues: base + '/clues.html' },
    hosts: { babble: ['localhost'], clues: ['localhost'] }, pace: 0 });
  ctx.patch({ usageSharing: true });
  const run = code => ctx.views.res.webContents.executeJavaScript(code);
  const ui = code => ctx.win.webContents.executeJavaScript(code);
  const open = length => ctx.openResource({ ...resources.find(item => item.wordLength === length), url: `${base}/words-${length}.html` });
  const ready = length => until(async () => ctx.views.res.webContents.getURL().includes(`words-${length}.html`) &&
    await run(`!!window.__babbleExpertWordList`) && await ui(`!document.getElementById('resLonger').disabled || ${length} === 12`));
  try {
    await until(() => ctx.engine.state.ready && ctx.engine.state.puzzleMatch === true);
    await sleep(150);
    open(6); await ready(6);
    await until(() => run(`innerHeight > 300 && innerWidth > 80`));
    await sleep(150);
    await run(`document.dispatchEvent(new MouseEvent('mousemove',{clientX:20,clientY:innerHeight-5,bubbles:true}))`);
    await sleep(120);
    await run(`(()=>{const field=document.querySelector('.find'); field.value='ens'; field.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    const typedPosition = await run('scrollY');
    await run(`document.dispatchEvent(new MouseEvent('mousemove',{clientX:21,clientY:innerHeight-4,bubbles:true}))`);
    await sleep(300);
    assert.ok(Math.abs(await run('scrollY') - typedPosition) < 2, 'Typing stops existing hover velocity and ignores accidental movement');
    assert.ok(await run(`Math.abs(document.querySelector('.found').getBoundingClientRect().top+8-(innerHeight+26)/2)<3`),
      'Typed prefix is centred below the search box: ' + await run(`JSON.stringify({rect:document.querySelector('.found').getBoundingClientRect().toJSON(),input:document.querySelector('.find').getBoundingClientRect().toJSON(),height:innerHeight,scroll:scrollY})`));
    await sleep(1500);
    await run(`document.dispatchEvent(new MouseEvent('mousemove',{clientX:22,clientY:innerHeight-4,bubbles:true}))`);
    await sleep(120);
    assert.ok(Math.abs(await run('scrollY') - typedPosition) < 2, 'Tiny movement after the pause does not restart hover scrolling');
    await run(`document.dispatchEvent(new MouseEvent('mousemove',{clientX:60,clientY:innerHeight-4,bubbles:true}))`);
    await sleep(150);
    assert.ok(Math.abs(await run('scrollY') - typedPosition) < 2, 'Briefly crossing an edge zone does not scroll');
    await sleep(400);
    const hoverDistance = await run('scrollY') - typedPosition;
    assert.ok(hoverDistance > 5 && hoverDistance < 75, 'Deliberate hovering scrolls gently after the dwell delay');
    await run(`document.dispatchEvent(new MouseEvent('mousemove',{clientX:60,clientY:40,bubbles:true}))`);
    const toolbarPosition = await run('scrollY');
    await sleep(400);
    assert.ok(Math.abs(await run('scrollY') - toolbarPosition) < 2, 'Moving toward the toolbar stops hover scrolling');
    assert.ok(await run(`document.dispatchEvent(new WheelEvent('wheel',{deltaY:50,cancelable:true}))`), 'Wheel scrolling is not prevented');
    assert.ok(await run(`document.dispatchEvent(new MouseEvent('mousedown',{button:1,buttons:4,cancelable:true}))`), 'Middle-button scrolling is not prevented');

    await run(`window.__babbleExpertWordList.centrePrefix('ensure'); document.querySelector('.find').value='unrelated'`);
    assert.equal(await run('window.__babbleExpertWordList.middleWord()'), 'ensure');
    await ui(`document.getElementById('resLonger').click()`); await ready(7);
    assert.match(await run('window.__babbleExpertWordList.middleWord()'), /^ensure/,
      'Plus uses the middle word rather than stale input and centres a matching longer word');
    await ui(`document.getElementById('resShorter').click()`); await ready(6);
    assert.equal(await run('window.__babbleExpertWordList.middleWord()'), 'ensure', 'Minus centres the matching shorter word');
    await run(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}}); [...document.querySelectorAll('.w')].find(word=>word.textContent==='ensure').click()`);
    await until(() => run(`location.hash.includes('submit=ensure')`));
    await run(`window.__babbleExpertWordList.centrePrefix('zyg')`);
    assert.ok(!(await run('window.__babbleExpertWordList.middleWord()')).startsWith('ens'), 'Scroll moved away from the clicked word');
    await ui(`document.getElementById('resLonger').click()`); await ready(7);
    assert.match(await run('window.__babbleExpertWordList.middleWord()'), /^ensure/, 'Plus anchors to the clicked word even after scrolling elsewhere');
    await run(`window.__babbleExpertWordList.centrePrefix('zyg')`);
    await ui(`document.getElementById('resShorter').click()`); await ready(6);
    assert.equal(await run('window.__babbleExpertWordList.middleWord()'), 'ensure', 'Clicked-word anchor survives successive length changes');
    await ui(`document.getElementById('resLonger').click()`); await ready(7);
    await run(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}}); [...document.querySelectorAll('.w')].find(word=>word.textContent==='orchard').click()`);
    await until(() => run(`location.hash.includes('submit=orchard')`));
    await run(`window.__babbleExpertWordList.centrePrefix('zyg')`);
    await ui(`document.getElementById('resLonger').click()`); await ready(8);
    assert.equal(await run('window.__babbleExpertWordList.middleWord()'), 'orchards', 'A newly clicked word replaces the previous anchor');
    const clues = code => ctx.views.clues.webContents.executeJavaScript(code);
    await clues(`window.savedGetAllWords=window.GetAllWords; window.GetAllWords=()=> ['rats','ratter'].join(String.fromCharCode(10)); document.body.insertAdjacentHTML('beforeend', '<table id="lookup-clues"><tr><td>ra4,5</td><td><input type="checkbox" checked><input name="edt998" value="rats"></td></tr><tr><td>ra6,18</td><td><input type="checkbox"><input name="edt999" value="ra"></td></tr><tr><td>ra6,18</td><td><input type="checkbox" checked><input name="edt1000" value="ratter"></td></tr></table>'); document.querySelector('[name="edt999"]').click()`);
    assert.deepEqual(await ctx.engine.pages.clues.entryContext({ name: 'edt999' }), { prefix: 'ra', length: 6, lower: 'rats', upper: 'ratter' });
    await ready(6);
    await until(() => run(`window.__babbleExpertWordList.middleWord()==='rattan'`));
    assert.equal(await run(`document.querySelector('.find').value`), 'rattan', 'Legacy clue click selects the first six-letter ra word between rats and ratter');
    await run(`window.__babbleExpertWordList.centrePrefix('zyg')`);
    await clues(`document.getElementById('lookup-clues').innerHTML='<tr><td>ra6,18</td><td><input type="checkbox"></td><td><input class="answer" data-answer-word="RATTEN" value="ra"></td></tr>'; document.querySelector('#lookup-clues .answer').click()`);
    await until(() => run(`window.__babbleExpertWordList.middleWord()==='rattan'`));
    assert.equal(await run(`document.querySelector('.find').value`), 'rattan', 'Self Serve Off-style clue click uses hidden found words and does not select the hidden target answer');
    assert.equal(await run(`window.__babbleExpertWordList.centreClue({prefix:'ra',length:6,lower:'rats',upper:'ratta'})`), '', 'No candidate is selected outside the alphabetical bounds');
    assert.ok(await run(`!document.querySelector('.found')`), 'An impossible clue lookup clears the previous candidate highlight');
    await clues(`window.GetAllWords=window.savedGetAllWords; document.getElementById('lookup-clues').remove()`);
    open(4); await ready(4);
    assert.ok(await ui(`document.getElementById('resShorter').disabled && !document.getElementById('resLonger').hidden`));
    assert.ok(await ui(`document.querySelector('.reshead').scrollWidth <= document.querySelector('.reshead').clientWidth`), 'All controls fit the narrow four-letter pane');
    open(12); await ready(12);
    assert.ok(await ui(`document.getElementById('resLonger').disabled`));
    assert.deepEqual(notifications.filter(event => event.event === 'resource').map(event => event.item), ['6 Letter Words'],
      'Only the first word-list opening notifies; +/- and menu length changes stay quiet');
    ctx.openResource({ label: 'Other resource', url: base + '/other', minWidth: 380 });
    await until(() => ui(`document.getElementById('resShorter').hidden && document.getElementById('resLonger').hidden`));
    open(4); await ready(4);
    ctx.hideResources(); open(5); await ready(5);
    assert.deepEqual(notifications.filter(event => event.event === 'resource').map(event => event.item), ['6 Letter Words', 'Other resource'],
      'Returning from another resource or hiding/reopening word lists never sends a second word-list report in this app session');
    console.log('ALL PASSED: keyboard priority, deliberate mouse resume, centred length changes, bounds and compact controls');
  } finally { server.close(); }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
