(() => {
'use strict';
document.getElementById('watch-tour').onclick = () => window.help.watchTour();
document.getElementById('copy-support').onclick = async () => {
  const status = document.getElementById('support-status');
  try { status.textContent = await window.help.copySupport() ? 'Copied. You can paste this into a message to lickety.' : 'Could not copy the summary.'; }
  catch { status.textContent = 'Could not copy. Please try again.'; }
};
const tabs = [...document.querySelectorAll('[role="tab"]')];
let notesLoaded = false;
// Release bodies come from GitHub. Build elements from text, never HTML.
function inline(parent, text) {
  const tokens = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let previous = 0, match;
  while ((match = tokens.exec(text))) {
    parent.append(document.createTextNode(text.slice(previous, match.index)));
    const element = document.createElement(match[2] ? 'strong' : match[3] ? 'code' : /^https?:\/\//i.test(match[5]) ? 'a' : 'span');
    element.textContent = match[2] || match[3] || match[4];
    if (element.tagName === 'A') { element.href = match[5]; element.target = '_blank'; element.rel = 'noreferrer'; }
    parent.append(element); previous = tokens.lastIndex;
  }
  parent.append(document.createTextNode(text.slice(previous)));
}
function markdown(parent, body, version) {
  let paragraph, list;
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('## What\'s new in Babble Expert ') && line.endsWith(version)) continue;
    const heading = line.match(/^#{1,6}\s+(.+)/), bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (!line.trim()) { paragraph = list = null; continue; }
    if (heading) { const h = document.createElement('h4'); inline(h, heading[1]); parent.append(h); paragraph = list = null; }
    else if (bullet) { if (!list) { list = document.createElement('ul'); parent.append(list); } const li = document.createElement('li'); inline(li, bullet[1]); list.append(li); paragraph = null; }
    else { if (!paragraph) { paragraph = document.createElement('p'); parent.append(paragraph); } else paragraph.append(' '); inline(paragraph, line); list = null; }
  }
}
function renderNotes(data) {
  if (!data) throw new Error('Release notes are unavailable.');
  document.getElementById('installedVersion').textContent = `You are running Babble Expert ${data.installedVersion}.`;
  const container = document.getElementById('releaseNotesContent'); container.replaceChildren();
  data.entries.forEach((entry, index) => {
    const installed = entry.version === data.installedVersion.split('.').slice(0, 3).join('.');
    const section = document.createElement(index === 0 || installed ? 'article' : 'details'); section.className = 'release-note';
    const heading = document.createElement(section.tagName === 'DETAILS' ? 'summary' : 'h3');
    heading.textContent = `Babble Expert ${entry.version}${installed ? ' — installed version' : ''}${entry.date ? ` · ${entry.date}` : ''}`;
    section.append(heading); markdown(section, entry.body, entry.version); container.append(section);
  });
  document.getElementById('releaseNotesStatus').textContent = data.message;
}
async function loadNotes(refresh = false) {
  notesLoaded = true;
  const button = document.getElementById('refreshReleaseNotes'); button.disabled = true;
  try {
    if (!refresh) renderNotes(await window.help.releaseNotes({ online: false }));
    document.getElementById('releaseNotesStatus').textContent = 'Checking for recent release notes…';
    renderNotes(await window.help.releaseNotes({ online: true, refresh }));
  } catch { document.getElementById('releaseNotesStatus').textContent = 'Could not refresh release notes. Included notes remain available.'; }
  finally { button.disabled = false; }
}
document.getElementById('refreshReleaseNotes').onclick = () => void loadNotes(true);
function select(tab) {
  for (const item of tabs) {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
  }
  document.querySelector('main').scrollTop = 0;
  if (tab.id === 'releaseNotesTab' && !notesLoaded) void loadNotes();
}
for (const tab of tabs) {
  tab.onclick = () => select(tab);
  tab.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    select(next); next.focus();
  };
}
document.getElementById('closeHelp').onclick = () => window.close();
window.help.onTopic(topic => { if (topic === 'release-notes') select(document.getElementById('releaseNotesTab')); });
if (new URLSearchParams(location.search).get('topic') === 'release-notes') select(document.getElementById('releaseNotesTab'));
addEventListener('keydown', event => { if (event.key === 'Escape') window.close(); });
})();
