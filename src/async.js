'use strict';
function withDeadline(task, timeoutMs, signal) {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    const abort = () => { controller.abort(); reject(Object.assign(new Error('Operation cancelled.'), { name: 'AbortError' })); };
    const timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('Operation timed out. Please try again.'), { code: 'ETIMEDOUT' })); }, timeoutMs);
    const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); clean(); return; }
    Promise.resolve().then(() => task(controller.signal)).then(resolve, reject).finally(clean);
    controller.signal.addEventListener('abort', clean, { once: true });
  });
}
module.exports = { withDeadline };
