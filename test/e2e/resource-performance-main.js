'use strict';
// Hidden renderers and real dictionaries. Structural assertions are portable;
// timings are reported without fragile machine-specific speed thresholds.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { parseWordList } = require('../../src/word-list-data');
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'be-resource-perf-')));
setTimeout(() => { console.error('Resource performance check timed out'); app.exit(1); }, 40000).unref();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  assert.ok(process.env.WORD_LIST_DIR, 'Set WORD_LIST_DIR to the hosted word-list repository');
  for (let length = 4; length <= 12; length++) {
    assert.ok(parseWordList(fs.readFileSync(path.join(process.env.WORD_LIST_DIR, `words-${length}.html`), 'utf8'), length).length > 0,
      `The packaged viewer accepts the existing ${length}-letter page unchanged`);
  }
  const win = new BrowserWindow({ show: false, width: 200, height: 700, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true } });
  const run = code => win.webContents.executeJavaScript(code);
  const html = fs.readFileSync(path.join(process.env.WORD_LIST_DIR, 'words-8.html'), 'utf8');
  const parseStarted = performance.now(), words = parseWordList(html, 8), parseMs = performance.now() - parseStarted;
  await win.loadFile(path.join(process.env.WORD_LIST_DIR, 'words-8.html'));
  const oldNodes = await run("document.querySelectorAll('.w').length");
  assert.equal(oldNodes, words.length); assert.ok(oldNodes > 20000);
  const started = performance.now();
  await win.loadFile(path.join(__dirname, '../../src/ui/word-list.html'));
  await run(`window.diceChecks=0;const explainDice=window.BabbleDice.explain;window.BabbleDice.explain=word=>{window.diceChecks++;return explainDice(word)};void 0`);
  await run(`window.BabbleWordList.start(${JSON.stringify({ words, length: 8 })})`);
  const readyMs = performance.now() - started;
  const pool = await run('window.__babbleExpertWordList.metrics()');
  assert.equal(pool.count, oldNodes); assert.ok(pool.rendered < 100);
  assert.equal(await run('window.diceChecks'), pool.rendered, 'Only rendered words are classified, not the full dictionary');
  await run("window.__babbleExpertWordList.restoreResults([],true)");
  assert.equal(await run('window.diceChecks'), pool.rendered, 'Repainting visible rows uses cached dice classifications');
  win.webContents.debugger.attach('1.3'); await win.webContents.debugger.sendCommand('Performance.enable');
  const layout = async () => (await win.webContents.debugger.sendCommand('Performance.getMetrics')).metrics.find(metric => metric.name === 'LayoutDuration').value;
  const before = await layout();
  await run(`(()=>{for(let i=0;i<40;i++){document.body.style.width=(180+i%2*10)+'px';void document.body.offsetHeight;}document.body.style.width='';})()`);
  const resizeLayoutMs = ((await layout()) - before) * 1000;
  const known = words.filter((_, i) => i % Math.ceil(words.length / 300) === 0).map(word => ({ word, color: 'amber' }));
  known.push({ word: 'orchards', color: 'green', message: 'Added to Babble: orchards' });
  const restoration = await run(`(()=>{const items=${JSON.stringify(known)},observer=new MutationObserver(()=>{});observer.observe(document.querySelector('.words'),{attributes:true,subtree:true,childList:true});const start=performance.now();window.__babbleExpertWordList.restoreResults(items,true);const elapsed=performance.now()-start,changes=observer.takeRecords().length;window.__babbleExpertWordList.restoreResults(items);const repeated=observer.takeRecords().length;observer.disconnect();return {elapsed,changes,repeated};})()`);
  assert.equal(restoration.repeated, 0);
  assert.ok(restoration.changes < known.length, 'Offscreen results do not create or mutate dictionary rows');
  for (const [word, color] of [['orchards', 'green'], [words[0], 'amber'], [words.at(-1), null]]) {
    await run(`window.__babbleExpertWordList.centrePrefix(${JSON.stringify(word)})`);
    assert.equal(await run("document.querySelector('.found').textContent"), word);
    assert.equal(await run("document.querySelector('.found').dataset.beResult || null"), color);
    assert.ok(await run("document.querySelectorAll('.w').length < 100"));
  }
  for (const factor of [0.75, 1, 1.5, 2]) {
    win.webContents.setZoomFactor(factor); await sleep(80);
    await run("window.__babbleExpertWordList.centrePrefix('orchards')");
    assert.equal(await run('window.__babbleExpertWordList.middleWord()'), 'orchards');
    assert.ok(await run("Math.abs(document.querySelector('.found').getBoundingClientRect().top+8-(innerHeight+26)/2)<3"));
  }
  await run('window.__babbleExpertWordList.restoreResults([],true)');
  assert.ok(await run("!document.querySelector('[data-be-result]')"), 'Puzzle reset clears recycled rows');
  const fixture = ['baby','bike','bore','mugg','qaid','quit','viva'];
  await run(`window.BabbleWordList.start(${JSON.stringify({ words: fixture, length: 4 })})`);
  assert.equal(await run("document.querySelector('[data-index=\"0\"]').dataset.diceConflict"), 'true');
  assert.equal(await run("getComputedStyle(document.querySelector('[data-index=\"0\"]')).backgroundColor"), 'rgb(224, 224, 224)');
  assert.equal(await run("document.querySelector('[data-index=\"2\"]').hasAttribute('data-dice-conflict')"), false);
  assert.match(await run("document.querySelector('[data-index=\"1\"]').title"), /Possible dice conflict/);
  await run("window.__babbleExpertWordList.centrePrefix('bike')");
  assert.equal(await run("getComputedStyle(document.querySelector('.found')).backgroundColor"), 'rgb(224, 224, 224)', 'Search selection must not hide the gray dice hint');
  assert.notEqual(await run("getComputedStyle(document.querySelector('.found')).boxShadow"), 'none', 'A border identifies the selected gray word');
  await run("window.__babbleExpertWordList.finishWord({word:'bike',color:'green',message:'Added to Babble'})");
  assert.equal(await run("getComputedStyle(document.querySelector('[data-index=\"1\"]')).backgroundColor"), 'rgb(151, 204, 50)', 'Confirmed word results override the gray hint even on the searched word');
  assert.match(await run("document.querySelector('[data-index=\"1\"]').title"), /Added to Babble/);
  win.webContents.setZoomFactor(1); win.setSize(240, 400); await sleep(80);
  const shots = path.join(__dirname, '../../artifacts/dice-conflicts'); fs.mkdirSync(shots, { recursive: true });
  fs.writeFileSync(path.join(shots, 'word-list.png'), (await win.webContents.capturePage()).toPNG());
  await run("document.querySelector('[data-index=\"0\"]').click()");
  assert.equal(await run("new URLSearchParams(location.hash.slice(1)).get('submit')"), 'baby', 'Gray words remain clickable');
  console.log(JSON.stringify({ words: words.length, previousWordNodes: oldNodes, visibleWordNodes: pool.rendered, sourceParseMs: parseMs, localViewerReadyMs: readyMs, resizeLayoutMs, restoration }));
  win.destroy(); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
