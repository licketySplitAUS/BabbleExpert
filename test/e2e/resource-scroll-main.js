'use strict';
// Hidden renderer: verify scrolling without moving the user's mouse or windows.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const { wordListScript } = require('../../src/word-list');
const { makeBabbleGlowScript } = require('../../src/babble-glow');
app.disableHardwareAcceleration();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-scroll-'));
app.setPath('userData', path.join(dir, 'profile'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = setTimeout(() => { console.error('Scroll test timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const source = process.env.WORD_LIST_DIR;
  assert.ok(source, 'Set WORD_LIST_DIR to the hosted word-list repository');
  const preload = path.join(dir, 'probe.js');
  fs.writeFileSync(preload, `
    window.scrollProbe = { frames: 0, scrolls: 0 };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(time => { window.scrollProbe.frames++; callback(time); });
    const scroll = window.scrollBy.bind(window);
    window.scrollBy = (...args) => { window.scrollProbe.scrolls++; return scroll(...args); };
  `);
  const win = new BrowserWindow({ show: false, width: 200, height: 700,
    webPreferences: { preload, sandbox: false, contextIsolation: false, nodeIntegration: false, offscreen: true, backgroundThrottling: false } });
  const run = code => win.webContents.executeJavaScript(code);
  await win.loadFile(path.join(source, 'words-8.html'));
  await sleep(150);
  const count = await run("document.querySelectorAll('.w').length");
  assert.ok(count > 20000, 'Exercise a large real word list');
  async function idle(label) {
    await sleep(100);
    const before = await run('scrollProbe.frames');
    await sleep(250);
    assert.equal(await run('scrollProbe.frames'), before, label + ': no idle animation callbacks');
  }
  async function middle(label) {
    await run(`document.dispatchEvent(new MouseEvent('mousedown',{button:1,buttons:4,bubbles:true}));
      document.dispatchEvent(new MouseEvent('mouseup',{button:1,buttons:0,bubbles:true}));
      scrollProbe.scrolls=0;
      document.dispatchEvent(new MouseEvent('mousemove',{clientX:80,clientY:innerHeight-3,buttons:0,bubbles:true}));`);
    await sleep(650);
    assert.equal(await run('scrollProbe.scrolls'), 0, label + ': hover does not fight native autoscroll after button release');
    await idle(label + ' middle button');
    await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  }
  await idle('Hosted page');
  await middle('Hosted page');
  await run(wordListScript);
  await idle('Expert plus hosted page');
  await middle('Expert');
  await run(`document.querySelector('.find').value='orchards';
    document.querySelector('.find').dispatchEvent(new Event('input',{bubbles:true}));`);
  assert.equal(await run("document.querySelector('.found').textContent"), 'orchards');
  assert.equal(await run('window.__babbleExpertWordList.middleWord()'), 'orchards');
  await idle('After searching');
  await sleep(1500);
  await run("document.dispatchEvent(new MouseEvent('mousemove',{clientX:20,clientY:innerHeight-3,bubbles:true}))");
  await run("document.dispatchEvent(new MouseEvent('mousemove',{clientX:80,clientY:innerHeight-3,bubbles:true}))");
  await sleep(600);
  assert.ok(await run('scrollProbe.scrolls') > 1, 'Gentle hover scrolling still works');
  await run("document.dispatchEvent(new MouseEvent('mouseleave'))");
  await idle('After leaving the list');
  console.log('ALL PASSED: ' + count + ' words; zero idle animation callbacks; native middle-button priority; search and hover retained');
  for (const [length, expected] of [[6, 'ensure'], [7, 'ensured'], [6, 'ensure']]) {
    await win.loadFile(path.join(source, 'words-' + length + '.html'));
    await run(wordListScript);
    await run("window.__babbleExpertWordList.centrePrefix('ensure')");
    assert.equal(await run("window.__babbleExpertWordList.middleWord()"), expected, 'Length-change anchors remain centred');
  }
  await run("window.__babbleExpertWordList.centreClue({prefix:'ra',length:6,lower:'rats',upper:'ratter'})");
  assert.equal(await run("document.querySelector('.found').textContent"), 'rattan', 'Bounded clue lookup still selects the first candidate');
  await run("document.querySelector('.find').value='no-such-word';document.querySelector('.find').dispatchEvent(new Event('input',{bubbles:true}))");
  assert.ok(await run("!document.querySelector('.found')"), 'Unmatched typing clears the old result');
  console.log('ALL PASSED: length-change anchors and bounded clue lookup');
  win.setSize(1100, 700);
  await win.loadFile(path.join(__dirname, 'fixtures/babble.html'));
  await run("document.head.insertAdjacentHTML('beforeend','<style>#left_column table{width:350px;height:350px}#left_column td{width:70px;height:70px}</style>')");
  await run(makeBabbleGlowScript(['']));
  assert.ok(await run("document.querySelector('#babble-expert-glow').animationsPaused()"), 'No idle glow animation');
  await run("window.__babbleExpertGlow.update('bravo')");
  assert.ok(await run("!document.querySelector('#babble-expert-glow').animationsPaused()"), 'Typing still animates the path');
  assert.ok(await run("Number(document.querySelector('.be-contour').getAttribute('width'))<450"), 'Glow filter covers grid path instead of the whole viewport');
  await run(`window.glowPaints=0;new MutationObserver(()=>glowPaints++).observe(document.querySelector('.be-live'),{childList:true});
    for(let i=0;i<20;i++)document.querySelector('#word_list').dispatchEvent(new Event('scroll'));`);
  await sleep(100);
  assert.equal(await run('glowPaints'), 0, 'Nested word-list scrolling never rebuilds the grid highlight');
  await run("for(let i=0;i<20;i++)document.dispatchEvent(new Event('scroll'))");
  await sleep(100);
  assert.equal(await run('glowPaints'), 1, 'Page scrolling coalesces grid repaints to one per frame');
  await run("window.__babbleExpertGlow.finish('bravo','green')");
  await sleep(1300);
  assert.ok(await run("document.querySelector('#babble-expert-glow').animationsPaused()"), 'Completion stops idle glow work');
  console.log('ALL PASSED: bounded glow filters, batched page repaint, no nested-list repaint, idle glow paused');
  win.destroy(); clearTimeout(deadline); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
