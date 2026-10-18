'use strict';

function installWordList() {
  if (window.__babbleExpertWordList) return true;
  const input = document.querySelector('.find');
  const words = Array.from(document.querySelectorAll('.words .w'));
  if (!input || !words.length) return false;
  const labels = words.map(word => word.textContent.trim());
  const lowerBound = value => {
    let low = 0, high = labels.length;
    while (low < high) { const mid = (low + high) >>> 1; if (labels[mid] < value) low = mid + 1; else high = mid; }
    return low;
  };
  let marked = document.querySelector('.w.found'), nativeScroll = false, frame = 0;
  let keyboardUntil = 0, resumeFrom = null, needsResumeBaseline = false, centredWord = null;
  let hoverSpeed = 0, hoverDirection = 0, hoverSince = 0, previousFrame = performance.now();
  document.dispatchEvent(new MouseEvent('mouseleave'));
  const stopHover = () => { hoverSpeed = 0; hoverDirection = 0; cancelAnimationFrame(frame); frame = 0; };
  document.addEventListener('mouseleave', stopHover);
  document.addEventListener('wheel', stopHover, { passive: true });
  document.addEventListener('mousedown', event => {
    stopHover();
    // Native middle-button autoscroll continues after the button is released.
    nativeScroll = event.button === 1 ? !nativeScroll : false;
  }, true);
  addEventListener('blur', () => { nativeScroll = false; stopHover(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { nativeScroll = false; stopHover(); } });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { nativeScroll = false; stopHover(); }
    if (event.target === input && event.key === 'Enter') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (marked) marked.click();
    }
  }, true);
  function glide(now) {
    frame = 0;
    if (!hoverSpeed || nativeScroll || document.hidden) return;
    const elapsed = Math.min(now - previousFrame, 50) / 1000;
    previousFrame = now;
    if (hoverSpeed && now - hoverSince >= 300) scrollBy(0, hoverSpeed * elapsed);
    frame = requestAnimationFrame(glide);
  }

  function pauseMouse() {
    stopHover();
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
      const part = prefix.slice(0, size), index = lowerBound(part);
      if (labels[index]?.startsWith(part)) return words[index];
    }
    return words[0];
  }
  function select(word) {
    if (marked) marked.classList.remove('found');
    marked = word || null;
    if (marked) { marked.classList.add('found'); centre(marked); }
  }
  document.addEventListener('input', event => {
    if (event.target !== input) return;
    // Own this known word-list field so the hosted page doesn't repeat its
    // full-list search and scrollIntoView before we centre the same result.
    event.stopImmediatePropagation();
    pauseMouse();
    const prefix = input.value.trim().toLowerCase(), index = lowerBound(prefix);
    select(prefix && labels[index]?.startsWith(prefix) ? words[index] : null);
  }, true);
  document.addEventListener('mousemove', event => {
    // Replace the hosted page's fast hover scrolling; native wheel/middle-button
    // scrolling remains available because no default mouse action is cancelled.
    event.stopImmediatePropagation();
    const pointer = { x: event.clientX, y: event.clientY };
    if (nativeScroll || event.buttons) { stopHover(); return; }
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
    if (!speed) stopHover();
    else if (!frame) { previousFrame = performance.now(); frame = requestAnimationFrame(glide); }
  }, true);
  document.querySelector('.words').addEventListener('click', event => {
    if (event.target.closest('.w')) { if (marked) marked.classList.remove('found'); marked = null; }
  });
  window.__babbleExpertWordList = {
    centreClue({ prefix, length, lower, upper }) {
      let index = lowerBound(prefix);
      if (lower) index = Math.max(index, lowerBound(lower));
      let word;
      for (; index < labels.length && labels[index].startsWith(prefix); index++) {
        const text = labels[index];
        if (upper && text >= upper) break;
        if (text.length === length && (!lower || text > lower)) { word = words[index]; break; }
      }
      if (!word) {
        pauseMouse(); input.value = prefix;
        select(null);
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
