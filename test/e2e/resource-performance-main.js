'use strict';
// Measure the large hosted list in a hidden renderer, without network traffic.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { wordListScript } = require('../../src/word-list');
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'be-resource-perf-')));
const deadline = setTimeout(() => app.exit(1), 30000);
app.whenReady().then(async () => {
  assert.ok(process.env.WORD_LIST_DIR, 'Set WORD_LIST_DIR to the hosted word-list repository');
  const win = new BrowserWindow({ show: false, width: 200, height: 700,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  const run = code => win.webContents.executeJavaScript(code);
  await win.loadFile(path.join(process.env.WORD_LIST_DIR, 'words-8.html'));
  const count = await run("document.querySelectorAll('.w').length");
  const height = await run('document.documentElement.scrollHeight');
  assert.ok(count > 20000);
  win.webContents.debugger.attach('1.3');
  const cdp = (method, params) => win.webContents.debugger.sendCommand(method, params);
  await cdp('Performance.enable');
  const layoutTime = async () => (await cdp('Performance.getMetrics')).metrics.find(m => m.name === 'LayoutDuration').value;
  async function resizeCost() {
    const before = await layoutTime();
    await run(`(function(){for(let i=0;i<40;i++){
      document.body.style.width=(180+i%2*10)+'px';
      void document.body.offsetHeight;
    } document.body.style.width='';})()`);
    return (await layoutTime() - before) * 1000;
  }
  const before = await resizeCost();
  await run(wordListScript);
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.equal(await run("document.querySelectorAll('.w').length"), count, 'All words remain available to page handlers');
  assert.ok(Math.abs(await run('document.documentElement.scrollHeight') - height) <= 2, 'Off-screen groups preserve the scroll range (allowing glyph overflow rounding)');
  const skipped = await run("[...document.querySelectorAll('.be-word-group')].filter(g=>!g.firstElementChild.checkVisibility({contentVisibilityAuto:true})).length");
  assert.ok(skipped > 100, 'Distant groups skip rendering');
  const after = await resizeCost();
  const restoration = await run(`(()=>{
    const rows=[...document.querySelectorAll('.w')];
    const known=rows.filter((_,i)=>i%Math.ceil(rows.length/300)===0).map(row=>({word:row.textContent,color:'amber'}));
    known.push({word:'orchards',color:'green'});
    const observer=new MutationObserver(()=>{});
    observer.observe(document.querySelector('.words'),{attributes:true,subtree:true});
    const start=performance.now();
    window.__babbleExpertWordList.restoreResults(known,true);
    const elapsed=performance.now()-start;
    const changes=observer.takeRecords().length;
    window.__babbleExpertWordList.restoreResults(known);
    const repeatedChanges=observer.takeRecords().length;
    observer.disconnect();
    return {known:new Set(known.map(result=>result.word)).size,coloured:document.querySelectorAll('[data-be-result]').length,changes,repeatedChanges,elapsed};
  })()`);
  assert.ok(restoration.known > 250, 'Exercise hundreds of known results');
  assert.equal(restoration.coloured, restoration.known, 'Only known words are coloured, including distant words');
  assert.equal(restoration.repeatedChanges, 0, 'Identical result snapshots do not mutate the DOM');
  assert.ok(restoration.changes <= restoration.known * 2, 'Restoration touches only known rows');
  console.log(JSON.stringify({ words: count, skippedGroups: skipped, resizeLayoutMsBefore: before, resizeLayoutMsAfter: after, restoration }));
  // Timing is diagnostic; avoid machine-dependent speed assertions.
  for (const prefix of ['aard', 'orchards', 'zyzz']) {
    await run(`window.__babbleExpertWordList.centrePrefix(${JSON.stringify(prefix)})`);
    assert.ok((await run("document.querySelector('.found').textContent")).startsWith(prefix), 'Search can reach skipped groups');
    if (prefix === 'orchards') assert.equal(await run('window.__babbleExpertWordList.middleWord()'), prefix, 'A distant result is centred');
    if (prefix === 'orchards') assert.equal(await run("getComputedStyle(document.querySelector('.found')).backgroundColor"), 'rgb(151, 204, 50)', 'A restored off-screen result has the right colour when scrolled into view');
    assert.ok(Math.abs(await run('document.documentElement.scrollHeight') - height) <= 2, 'Search does not change the scroll range');
  }
  win.destroy(); clearTimeout(deadline); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
