(() => {
'use strict';
const $ = id => document.getElementById(id);
updateHighlights.get().then(data => {
  if (!data) throw Error('Unavailable');
  $('edition').textContent = data.preview ? 'PREVIEW · NEXT UPDATE' : `BABBLE EXPERT ${data.version}`;
  if (data.preview) $('intro').textContent = 'A preview of the features planned for the next release.';
  for (const item of data.items) {
    const article = document.createElement('article'), title = document.createElement('h2'), body = document.createElement('p');
    title.textContent = item.title; body.textContent = item.body; article.append(title, body); $('features').append(article);
  }
  $('ok').disabled = false; $('ok').focus();
}).catch(() => { $('status').textContent = 'The new features could not be loaded. Close this window and try again from Options → What’s new.'; });
$('ok').onclick = async () => {
  $('ok').disabled = true;
  try { if (!await updateHighlights.acknowledge()) throw Error('Unavailable'); window.close(); }
  catch { $('status').textContent = 'Could not save your acknowledgement. Please try again.'; $('ok').disabled = false; }
};
$('notes').onclick = () => updateHighlights.releaseNotes();
})();
