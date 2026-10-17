(() => {
'use strict';
const tabs = [...document.querySelectorAll('[role="tab"]')];
function select(tab) {
  for (const item of tabs) {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
  }
  document.querySelector('main').scrollTop = 0;
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
addEventListener('keydown', event => { if (event.key === 'Escape') window.close(); });
})();
