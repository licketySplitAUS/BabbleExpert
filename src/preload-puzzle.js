'use strict';
// A deliberately narrow bridge: the remote page never receives access to IPC.
const { ipcRenderer } = require('electron');
let clicks = [];

document.addEventListener('click', event => {
  const image = event.target && event.target.closest && event.target.closest('img');
  if (!image) return;
  let pathname;
  try { pathname = new URL(image.currentSrc || image.src, location.href).pathname; } catch { return; }
  // The original Clues pages have used both MyLogo.gif and MyLogo.jpg.
  if (!/\/MyLogo(?:-full)?\.(?:gif|jpe?g|png|webp)$/i.test(pathname)) return;
  event.preventDefault(); // Keep the linked full-size image from interrupting the five clicks.
  const now = performance.now();
  clicks = clicks.filter(time => now - time <= 1000);
  clicks.push(now);
  if (clicks.length >= 5) {
    clicks = [];
    ipcRenderer.send('celebration:preview');
  }
}, true);
