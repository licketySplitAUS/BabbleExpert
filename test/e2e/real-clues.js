'use strict';
// Optional: runs the app against YOUR real babbleclues.html (not bundled; pass its path) and a fake Babble.
//   REAL_CLUES=/path/to/babbleclues.html npm run test:real-clues
const { app } = require('electron');
app.commandLine.appendSwitch('no-sandbox'); app.commandLine.appendSwitch('disable-gpu'); app.disableHardwareAcceleration();
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createApp } = require('../../src/app');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; };
async function until(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; }

app.whenReady().then(async () => {
  const file = process.env.REAL_CLUES;
  if (!file || !fs.existsSync(file)) { console.log('SKIPPED: set REAL_CLUES to the path of babbleclues.html'); return app.exit(0); }
  const cluesHtml = fs.readFileSync(file);
  // the page keeps its answers obfuscated; decode in memory only, to pick words to test with
  const dec = s => { let o = ''; for (let i = 0; i < s.length; i += 2) o += String.fromCharCode(parseInt(s.substr(i, 2), 10)); return o.toLowerCase(); };
  const words = [...new Set([...cluesHtml.toString('latin1').matchAll(/lWordArray\[\d+\]="(\d+)"/g)].map(m => dec(m[1])).filter(w => /^[a-z]{4,}$/.test(w)))];
  const [w1, w2, w3, w4] = words;
  const tiles = [...cluesHtml.toString('latin1').matchAll(/onClick\s*=\s*"addLetter\('([a-z]+)'\);?"/gi)].map(match => match[1][0].toLowerCase());
  const board = '<table>' + Array.from({ length: 5 }, (_, row) => '<tr>' + tiles.slice(row * 5, row * 5 + 5).map(letter => `<td><img src="/images/${letter}.gif"></td>`).join('') + '</tr>').join('') + '</table>';
  const puzzleId = cluesHtml.toString('latin1').match(/lBabbleID\s*=\s*['"]?(\d+)/g)?.map(value => value.match(/(\d+)$/)?.[1]).filter(value => value && value !== '0').at(-1) || '8097';
  const babble = `<!doctype html><a href="/x/8097/chat_log">c</a><span id="total_words_left">5</span>
    ${board}<table id="word_list"><tbody><tr><td class="word">${w1}</td></tr><tr><td class="word">notinpuzzlexx</td></tr></tbody></table>
    <form name="post_message"><input name="add_message"></form>
    <script>var puzzle_id=${JSON.stringify(puzzleId)};function AddWord(w){var tr=document.createElement('tr');tr.innerHTML='<td class="word"></td>';tr.firstChild.textContent=w;document.querySelector('#word_list tbody').appendChild(tr);return 'ok';}function AddChatMessage(){}</script>`;
  const server = http.createServer((q, s) => { s.setHeader('content-type', 'text/html; charset=utf-8'); s.end(q.url.startsWith('/clues') ? cluesHtml : babble); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://localhost:' + server.address().port;
  const ctx = createApp({ tourPrompt: false, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'be-real-')), urls: { babble: base + '/babble', clues: base + '/clues.html' }, hosts: { babble: ['localhost'], clues: ['localhost'] }, tickMs: 300, pace: 0 });
  const { win, engine, views } = ctx; win.show();
  const inClues = js => views.clues.webContents.executeJavaScript(js);
  const grid = async () => JSON.parse(await views.babble.webContents.executeJavaScript(`JSON.stringify([].map.call(document.querySelectorAll('#word_list td.word'),e=>e.textContent))`));

  ok(await until(() => engine.state.ready && engine.state.cluesOk), 'real clues page + fake Babble connected (' + words.length + ' decodable puzzle words)');
  ok(await inClues('lTotalWords') > 0, 'real page loaded in the native view: puzzle ' + await inClues('lBabbleID') + ', ' + await inClues('lTotalWords') + ' clues');

  const pages = engine.pages.clues;
  ok(['1', '2'].includes(await pages.addBabbleWord(w1)), 'Babble startup word is available on the real clue page');
  ok(await pages.addBabbleWord(w1) === '2', 'AddBabbleWord(same word again) => "2"');
  ok(await pages.addBabbleWord('qqqqzzzz') === '0', 'AddBabbleWord(not in puzzle) => "0"');
  ok(JSON.stringify(await pages.getAllWords()) === JSON.stringify([w1]), 'GetAllWords() returns exactly the ticked word');
  await pages.showAll(); ok(await inClues(`document.getElementById('totalOnCount').innerHTML`) === '1', 'showAll() updated the real page counters (On = 1)');
  const lookupName = await inClues(`'edt' + (lCleanWords.indexOf(${JSON.stringify(w2)}) + 1)`);
  const lookup = await pages.entryContext({ name: lookupName });
  ok(lookup && lookup.length === w2.length && lookup.prefix === w2.slice(0, 2) && lookup.lower === w1, 'real Lickety clue entry exposes length, starting letters and solved neighbour for resource lookup');
  ok(await inClues(`document.myForm.check${await inClues(`lCleanWords.indexOf(${JSON.stringify(w1)})+1`)}.checked`) === true, 'the real page checkbox is really ticked');

  // the two buttons, clicked for real
  await inClues(`AddBabbleWord(${JSON.stringify(w2)})`);
  await win.webContents.executeJavaScript(`document.querySelector('#btnSend').click()`);
  ok(await until(async () => (await grid()).includes(w2)), 'button "Send Words to Babble ->": a word ticked on the real page reaches the Babble grid');
  ok((await grid()).filter(w => w === w1).length === 1, '...a word already in the grid is not sent again');
  await inClues(`document.myForm.addWord.value=${JSON.stringify(w3)}; AddWord();`);   // typed on the page itself, like a user
  ok(await until(async () => (await grid()).includes(w3)), 'a native entry on the real Lickety page automatically reaches Babble');
  await ctx.views.babble.webContents.executeJavaScript(`AddWord(${JSON.stringify(w4)})`);
  ok(await until(async () => (await pages.getAllWords()).includes(w4)), 'a native Babble entry automatically ticks the real Lickety page');
  await ctx.views.babble.webContents.executeJavaScript(`AddWord('notaclueword')`);
  await win.webContents.executeJavaScript(`document.querySelector('#btnGet').click()`);
  ok(await until(async () => (await pages.getAllWords()).length >= 3), 'button "<- Send Words to Clues": Babble grid words are ticked on the real page');
  ok(!(await pages.getAllWords()).includes('notaclueword'), '...and non-clue words are ignored');

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED'); server.close(); app.exit(failures ? 1 : 0);
}).catch(e => { console.error('crashed', e); app.exit(2); });
