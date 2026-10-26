'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
for (const method of ['show', 'showInactive', 'focus', 'maximize']) BrowserWindow.prototype[method] = function () {};
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'be-auto-clue-')));
const { createApp } = require('../../src/app'), resources = require('../../src/resources');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async fn => { for (let i = 0; i < 160; i++) { try { if (await fn()) return; } catch {} await sleep(50); } throw Error('Automatic clue navigation timed out'); };
setTimeout(() => { console.error('Auto-clue test timed out'); app.exit(1); }, 30000).unref();
app.whenReady().then(async () => {
  let clueHtml = fs.readFileSync(path.join(__dirname, 'fixtures/clues.html'), 'utf8');
  clueHtml = clueHtml.replace('</body>', `<script>
    document.querySelector('[name=edt1]').remove();
    document.body.insertAdjacentHTML('beforeend','<div class="showline"><input type="radio" name="view"><input type="radio" name="view"><input type="radio" name="view" checked></div><table id="answers"></table>');
    function render(){var active=document.querySelector('[data-babble-expert-active-clue] .answer')?.dataset.answerWord;var radios=document.querySelectorAll('[name=view]');document.querySelector('#answers').innerHTML=puzzle.filter(function(w){return radios[2].checked?!ticked.includes(w):radios[1].checked?ticked.includes(w):true}).map(function(w){return '<tr class="'+(ticked.includes(w)?'done':'')+'"><td>'+w.slice(0,2)+w.length+',10</td><td><input type="checkbox" '+(ticked.includes(w)?'checked':'')+'></td><td><input class="answer" data-answer-word="'+w.toUpperCase()+'" value="'+(ticked.includes(w)?w:w.slice(0,2))+'"></td></tr>'}).join('');if(active){var field=document.querySelector('[data-answer-word="'+active+'"]');if(field)field.closest('tr').setAttribute('data-babble-expert-active-clue','')}}
    AddBabbleWord=function(w){w=String(w).toLowerCase();if(!puzzle.includes(w))return '0';if(ticked.includes(w))return '2';ticked.push(w);render();return '1'};
    showAll=render;document.querySelectorAll('[name=view]').forEach(function(r){r.addEventListener('change',render)});render();
  </script></body>`);
  let babbleHtml = fs.readFileSync(path.join(__dirname, 'fixtures/babble.html'), 'utf8')
    .replace(/<table id="word_list">[\s\S]*?<\/table>/, '<table id="word_list"><tbody></tbody></table>')
    .replace('var left = 4', 'var left = 10').replace('id="total_words_left">4', 'id="total_words_left">10');
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    if (req.url.startsWith('/words-')) return res.end((req.url.includes('7.html') ? ['charlie'] : ['alpha', 'bravo', 'delta']).map(w => '<div class="w">'+w+'</div>').join(''));
    res.end(req.url.startsWith('/babble') ? babbleHtml : clueHtml);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://localhost:' + server.address().port;
  const ctx = createApp({ userDataDir: app.getPath('userData'), telemetryPrompt: false, telemetryEndpoint: null, tourPrompt: false, pace: 0, tickMs: 100,
    urls: { babble: base+'/babble', clues: base+'/clues' }, hosts: { babble: ['localhost'], clues: ['localhost'] } });
  const clues = code => ctx.views.clues.webContents.executeJavaScript(code), list = code => ctx.views.res.webContents.executeJavaScript(code);
  const active = () => clues("document.querySelector('[data-babble-expert-active-clue] .answer')?.dataset.answerWord");
  try {
    await until(() => ctx.engine.state.ready && ctx.engine.state.puzzleMatch === true);
    ctx.openResource({ ...resources.find(r => r.wordLength === 5), url: base+'/words-5.html' });
    await until(() => list('!!window.__babbleExpertWordList'));
    await clues("document.querySelector('[data-answer-word=ALPHA]').click()");
    await until(async () => await active() === 'ALPHA' && await list('window.__babbleExpertWordList.middleWord()') === 'alpha');
    await ctx.engine.submit('alpha');
    await until(async () => await active() === 'BRAVO' && await list('window.__babbleExpertWordList.middleWord()') === 'bravo');
    assert.equal(await clues("document.querySelectorAll('[name=view]')[2].checked"), true);
    await ctx.engine.submit('delta'); await sleep(500);
    assert.equal(await active(), 'BRAVO', 'Finding another clue does not skip the selected unfinished clue');
    await ctx.engine.submit('zzzz'); await ctx.engine.submit('alpha'); await sleep(300);
    assert.equal(await active(), 'BRAVO', 'Rejected and duplicate words do not advance again');
    await ctx.engine.submit('bravo');
    await until(async () => await active() === 'CHARLIE' && new URL(ctx.views.res.webContents.getURL()).searchParams.get('length') === '7' && await list('window.__babbleExpertWordList.middleWord()') === 'charlie');
    await clues("document.querySelectorAll('[name=view]')[0].click()");
    await clues("document.querySelector('[data-answer-word=CHARLIE]').click()");
    await until(async () => await active() === 'CHARLIE');
    await ctx.engine.submit('charlie'); await sleep(500);
    assert.equal(new URL(ctx.views.res.webContents.getURL()).searchParams.get('length'), '7', 'All mode does not automatically change Resources');
    await clues("document.querySelectorAll('[name=view]')[2].click()"); await sleep(500);
    assert.equal(await clues("document.querySelectorAll('.answer').length"), 0, 'No unfinished clues stops cleanly');
    console.log('PASS: selected completed clue advances both panes in Off mode, switches word lengths, ignores other/duplicate/rejected words, respects All mode and stops at completion.');
  } finally { server.close(); }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
