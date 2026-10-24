(() => {
'use strict';
const $ = id => document.getElementById(id);
let data = null, selected = '', page = 0, busy = false;
const PAGE = 20;
const duration = ms => { const seconds = Math.floor(ms / 1000), minutes = Math.floor(seconds / 60); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m ${seconds % 60}s`; };
const when = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const day = record => record.puzzleDate || new Date(record.firstSeenAt).toLocaleDateString();
function element(tag, text, className = '') { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
function render(next = data) {
  if (!next) return;
  data = next;
  $('enabled').checked = data.enabled; $('enabled').disabled = busy;
  $('recordingState').textContent = data.blocked ? 'Recording is unavailable until the saved journal is cleared.' : data.enabled ? (data.active ? 'Recording your active playing time.' : 'Recording enabled. Time resumes when you return to an available Babble puzzle.') : 'Recording paused. Your saved history is kept.';
  $('error').hidden = !data.error; $('error').textContent = data.error || '';
  $('puzzles').textContent = data.records.length.toLocaleString();
  $('finished').textContent = data.records.filter(record => record.completionObserved).length.toLocaleString();
  $('time').textContent = duration(data.records.reduce((sum, record) => sum + record.activeMs, 0));
  const filter = $('filter').value;
  const records = data.records.filter(record => filter === 'all' || (filter === 'completed' ? !!record.completedAt : !record.completedAt));
  page = Math.max(0, Math.min(page, Math.ceil(records.length / PAGE) - 1));
  $('records').hidden = !records.length; $('empty').hidden = !!records.length;
  $('empty').textContent = data.records.length ? 'No puzzles in this selection.' : data.enabled ? 'Play a Babble puzzle to begin your journal.' : 'Enable recording, then play a puzzle. Your progress will appear here.';
  $('rows').replaceChildren();
  for (const record of records.slice(page * PAGE, (page + 1) * PAGE)) {
    const row = document.createElement('tr'); row.classList.toggle('selected', selected === record.id);
    const puzzle = document.createElement('td'), button = element('button', `#${record.puzzleId}`);
    button.onclick = () => { selected = record.id; render(); $('detail').scrollIntoView({ block: 'nearest' }); };
    puzzle.append(button, element('small', day(record)));
    const found = element('td', `${record.found} / ${record.total}`);
    if (record.initialFound) found.append(element('small', `${record.initialFound} already found at start`));
    const status = document.createElement('td');
    status.append(element('span', record.completedAt ? record.completionObserved ? 'Complete' : 'Seen complete' : 'In progress', 'badge' + (record.completedAt ? ' complete' : '')));
    if (record.partial) status.append(element('small', 'Partly tracked'));
    row.append(puzzle, found, element('td', duration(record.activeMs)), status); $('rows').append(row);
  }
  $('previous').disabled = page === 0; $('next').disabled = (page + 1) * PAGE >= records.length;
  $('page').textContent = records.length ? `${page * PAGE + 1}–${Math.min(records.length, (page + 1) * PAGE)} of ${records.length}` : '';
  $('export').disabled = busy || data.blocked || !data.records.length; $('clear').disabled = busy || (!data.records.length && !data.blocked);
  const record = data.records.find(record => record.id === selected);
  $('detail').hidden = !record;
  if (record) {
    $('detailTitle').textContent = `Puzzle #${record.puzzleId} · ${day(record)}`;
    $('detailSummary').textContent = `${record.found} of ${record.total} words observed · ${duration(record.activeMs)} active time recorded.${record.partial ? ' This puzzle was partly tracked; this is not a full solving time.' : ''}`;
    $('longest').textContent = record.longest.length ? `Longest observed: ${record.longest.join(', ')} (${record.longest[0].length} letters)` : 'No confirmed words observed yet.';
    $('lengths').replaceChildren();
    const counts = Object.entries(record.byLength).sort((a, b) => Number(a[0]) - Number(b[0])), max = Math.max(1, ...counts.map(([, count]) => count));
    for (const [length, count] of counts) {
      const row = element('div', '', 'length-row'), track = element('div', '', 'length-track'), fill = element('div', '', 'length-fill');
      fill.style.width = `${count / max * 100}%`; track.append(fill);
      row.append(element('span', `${length} letters`), track, element('span', String(count), 'length-count')); $('lengths').append(row);
    }
    $('detailTimes').textContent = `First recorded ${when(record.firstSeenAt)}. Last observed ${when(record.lastSeenAt)}.${record.completedAt ? ` Seen complete ${when(record.completedAt)}.` : ''}`;
  }
}
async function action(work) {
  busy = true; $('message').textContent = ''; render();
  try { const result = await work(); if (result?.records) render(result); else if (result) $('message').textContent = result.error || result.message || ''; }
  catch { $('message').textContent = 'That action could not finish. Please try again.'; }
  finally { busy = false; render(); }
}
$('enabled').onchange = event => { const enabled = event.target.checked; void action(() => journal.enable(enabled)); };
$('clear').onclick = () => action(() => journal.clear());
$('export').onclick = () => action(() => journal.export());
$('filter').onchange = () => { page = 0; render(); };
$('previous').onclick = () => { page--; render(); }; $('next').onclick = () => { page++; render(); };
$('close').onclick = () => window.close();
addEventListener('keydown', event => { if (event.key === 'Escape') window.close(); });
journal.onChanged(render);
journal.get().then(render).catch(() => { $('error').hidden = false; $('error').textContent = 'The journal could not open. Close this window and try again from Options.'; });
})();
