(() => {
  'use strict';
  let enabled = false, target = null, timer = null;
  const description = document.createElement('span');
  description.id = 'expert-hint-description'; description.setAttribute('role', 'tooltip');
  Object.assign(description.style, { position: 'fixed', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' });
  document.body.append(description);
  function hide() {
    const hadHint = target !== null || timer !== null;
    clearTimeout(timer);
    timer = null;
    if (target) {
      const ids = (target.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== description.id);
      if (ids.length) target.setAttribute('aria-describedby', ids.join(' ')); else target.removeAttribute('aria-describedby');
    }
    target = null; if (hadHint) window.be.hint(null);
  }
  function candidate(node) { return node instanceof Element ? node.closest('[data-hint]') : null; }
  function begin(element) {
    if (!enabled || !element || element === target) return;
    hide(); target = element;
    description.textContent = element.dataset.hint;
    const ids = (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    element.setAttribute('aria-describedby', [...new Set([...ids, description.id])].join(' '));
    timer = setTimeout(() => {
      if (!target || !enabled || document.hidden) return;
      const r = target.getBoundingClientRect();
      window.be.hint({ text: target.dataset.hint, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, large: document.body.classList.contains('large-interface') });
    }, 1000);
  }
  // Adopt old native titles too, including live status text, without double tips.
  function adopt(element) {
    if (!(element instanceof Element)) return;
    if (element.hasAttribute('title')) {
      const text = element.getAttribute('title');
      if (text) element.dataset.hint = text; else delete element.dataset.hint;
      element.removeAttribute('title');
    }
  }
  document.querySelectorAll('[title]').forEach(adopt);
  new MutationObserver(records => records.forEach(record => {
    if (record.type === 'attributes') adopt(record.target);
    else record.addedNodes.forEach(node => { adopt(node); node.querySelectorAll?.('[title]').forEach(adopt); });
  })).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  document.addEventListener('pointerover', event => begin(candidate(event.target)));
  document.addEventListener('pointerout', event => { if (target && !target.contains(event.relatedTarget)) hide(); });
  document.addEventListener('focusin', event => begin(candidate(event.target)));
  document.addEventListener('focusout', hide);
  for (const event of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(event, hide, true);
  window.addEventListener('blur', hide); window.addEventListener('resize', hide);
  window.be.onHintDismiss(hide);
  window.expertHints = { setEnabled(value) { enabled = value === true; if (!enabled) hide(); } };
})();
