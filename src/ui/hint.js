window.hint.onContent(data => {
  document.getElementById('text').textContent = data.text;
  document.body.classList.toggle('large', data.large);
  document.body.classList.toggle('above', data.above);
  document.getElementById('caption').style.setProperty('--arrow', data.arrow + 'px');
});
