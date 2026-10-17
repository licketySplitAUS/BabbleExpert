'use strict';

function installWordList() {
  if (window.__babbleExpertWordList) return true;
  const input = document.querySelector('.find');
  const words = Array.from(document.querySelectorAll('.words .w'));
  if (!input || !words.length) return false;
  let keyboardUntil = 0, resumeFrom = null, needsResumeBaseline = false, centredWord = null;
  let hoverSpeed = 0, hoverDirection = 0, hoverSince = 0, previousFrame = performance.now();
  document.dispatchEvent(new MouseEvent('mouseleave'));
  const stopHover = () => { hoverSpeed = 0; hoverDirection = 0; };
  document.addEventListener('mouseleave', stopHover);
  document.addEventListener('wheel', stopHover, { passive: true });
  document.addEventListener('mousedown', stopHover, true);
  function glide(now) {
    const elapsed = Math.min(now - previousFrame, 50) / 1000;
    previousFrame = now;
    if (hoverSpeed && now - hoverSince >= 300) scrollBy(0, hoverSpeed * elapsed);
    requestAnimationFrame(glide);
  }
  requestAnimationFrame(glide);

  function pauseMouse() {
    keyboardUntil = performance.now() + 1400;
    needsResumeBaseline = true;
    // Stop the hosted page's existing hover-scroll velocity as well.
    document.dispatchEvent(new MouseEvent('mouseleave'));
  }
  function centre(word) {
    centredWord = word;
    const top = input.getBoundingClientRect().bottom;
    const rect = word.getBoundingClientRect();
    scrollBy(0, rect.top + rect.height / 2 - (top + innerHeight) / 2);
  }
  addEventListener('resize', () => {
    if (centredWord && performance.now() < keyboardUntil) centre(centredWord);
  });
  function find(prefix) {
    for (let size = prefix.length; size > 0; size--) {
      const match = words.find(word => word.textContent.startsWith(prefix.slice(0, size)));
      if (match) return match;
    }
    return words[0];
  }
  document.addEventListener('input', event => { if (event.target === input) pauseMouse(); }, true);
  document.addEventListener('input', event => {
    if (event.target !== input) return;
    const prefix = input.value.trim().toLowerCase();
    if (!prefix) return;
    const word = words.find(word => word.textContent === prefix) || words.find(word => word.textContent.startsWith(prefix));
    if (!word) return;
    document.querySelectorAll('.w.found').forEach(node => node.classList.remove('found'));
    word.classList.add('found');
    centre(word);
  });
  document.addEventListener('mousemove', event => {
    // Replace the hosted page's fast hover scrolling; native wheel/middle-button
    // scrolling remains available because no default mouse action is cancelled.
    event.stopImmediatePropagation();
    const pointer = { x: event.clientX, y: event.clientY };
    if (event.buttons) { stopHover(); return; }
    if (performance.now() < keyboardUntil) {
      stopHover();
      resumeFrom = pointer;
      return;
    }
    if (needsResumeBaseline) {
      needsResumeBaseline = false;
      resumeFrom = pointer;
      return;
    }
    // After typing, a small accidental movement must not restart hover scrolling.
    if (resumeFrom) {
      if (Math.hypot(pointer.x - resumeFrom.x, pointer.y - resumeFrom.y) < 18) {
        return;
      }
      resumeFrom = null;
      keyboardUntil = 0;
    }
    // A quiet strip below the search field lets the pointer reach −/+ safely.
    const top = input.getBoundingClientRect().bottom + 28;
    const zone = Math.min(120, (innerHeight - top) * .18);
    let speed = 0;
    if (pointer.y >= top && pointer.y < top + zone) speed = -140 * Math.pow((top + zone - pointer.y) / zone, 2);
    else if (pointer.y > innerHeight - zone) speed = 140 * Math.pow(Math.min(1, (pointer.y - innerHeight + zone) / zone), 2);
    const direction = Math.sign(speed);
    if (direction !== hoverDirection) hoverSince = performance.now();
    hoverDirection = direction;
    hoverSpeed = speed;
  }, true);
  window.__babbleExpertWordList = {
    centreClue({ prefix, length, lower, upper }) {
      const word = words.find(node => {
        const text = node.textContent.trim();
        return text.length === length && text.startsWith(prefix) && (!lower || text > lower) && (!upper || text < upper);
      });
      if (!word) {
        pauseMouse(); input.value = prefix;
        document.querySelectorAll('.w.found').forEach(node => node.classList.remove('found'));
        return '';
      }
      input.value = word.textContent.trim();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value;
    },
    middleWord() {
      const middle = (input.getBoundingClientRect().bottom + innerHeight) / 2;
      const distance = word => {
        const rect = word.getBoundingClientRect();
        return rect.top + rect.height / 2 - middle;
      };
      let low = 0, high = words.length - 1;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (distance(words[mid]) < 0) low = mid + 1;
        else high = mid;
      }
      const before = words[Math.max(0, low - 1)];
      const best = Math.abs(distance(before)) <= Math.abs(distance(words[low])) ? before : words[low];
      return best.textContent.trim();
    },
    centrePrefix(raw) {
      const prefix = String(raw || '').toLowerCase().replace(/[^a-z]/g, '');
      if (!prefix) return;
      const word = find(prefix);
      input.value = word.textContent;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  return true;
}

const wordListScript = `(${installWordList.toString()})()`;
module.exports = { wordListScript };
