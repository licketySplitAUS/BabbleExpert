'use strict';
(() => {
  let levels = [];
  const buttons = [...document.querySelectorAll('button')];
  function render(zoom) {
    document.querySelector('#level').textContent = zoom + '%';
    document.querySelector('#zoomIn').disabled = zoom >= levels[levels.length - 1];
    document.querySelector('#zoomOut').disabled = zoom <= levels[0];
  }
  zoomMenu.onState(render);
  document.querySelector('#zoomIn').onclick = () => zoomMenu.change('in');
  document.querySelector('#zoomOut').onclick = () => zoomMenu.change('out');
  document.querySelector('#zoomReset').onclick = () => zoomMenu.change('reset');
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') zoomMenu.change('close');
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const enabled = buttons.filter(button => !button.disabled);
    const index = enabled.indexOf(document.activeElement);
    enabled[(index + (event.key === 'ArrowDown' ? 1 : enabled.length - 1) + enabled.length) % enabled.length].focus();
  });
  zoomMenu.get().then(state => { if (state) { levels = state.levels; render(state.zoom); } });
})();
