(() => {
'use strict';
let history = [], state = {};
function render() {
  const list = document.getElementById('historyList'); list.replaceChildren();
  if (!history.length) { const li = document.createElement('li'); li.textContent = 'No entries yet.'; list.append(li); }
  for (const entry of history) {
    const li = document.createElement('li'), text = document.createElement('span'), message = document.createElement('span');
    text.className = 'entryText'; text.textContent = entry.text; text.title = entry.text;
    message.className = 'entryMessage'; message.textContent = entry.message;
    const restore = document.createElement('button'); restore.className = 'btn'; restore.textContent = entry.kind === 'chat' ? 'Restore draft' : 'Restore';
    restore.onclick = async () => { await be.action('restoreEntry', entry.id); window.close(); };
    li.append(text, message, restore);
    if (entry.kind === 'word' && !['pending', 'added', 'duplicate'].includes(entry.outcome) && (!entry.puzzleId || entry.puzzleId === state.puzzleId)) {
      const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = 'Retry word';
      retry.disabled = !!state.pending || !!state.busy;
      retry.onclick = () => { retry.disabled = true; be.action('retryEntry', entry.id); };
      li.append(retry);
    }
    list.append(li);
  }
}
document.getElementById('closeHistory').onclick = () => window.close();
addEventListener('keydown', event => { if (event.key === 'Escape') window.close(); });
be.onHistory(entries => { history = entries; render(); });
be.onState(next => { state = next; render(); });
(async () => { history = await be.getHistory(); state = await be.getState(); render(); })();
})();
