(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let state = null;
  function controls() {
    $('retry').disabled = !state || state.loading || state.sending;
    $('send').disabled = !state || state.loading || state.sending || state.sent || !$('definition').value.trim();
    $('definition').disabled = !state || state.loading || state.sending || state.sent;
  }
  function render(next) {
    if (!next) return;
    state = next;
    $('heading').textContent = `Create a clue for ${next.word.toUpperCase()}`;
    $('label').textContent = next.label;
    $('definition').value = next.clue || '';
    $('message').textContent = next.message || '';
    controls();
  }
  $('definition').addEventListener('input', controls);
  $('retry').onclick = () => window.clue.retry();
  $('send').onclick = () => window.clue.send($('definition').value);
  $('close').onclick = () => window.clue.close();
  addEventListener('keydown', event => { if (event.key === 'Escape') window.clue.close(); });
  window.clue.onState(render);
  window.clue.get().then(render);
})();
