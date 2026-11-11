'use strict';
// Coalesce periodic calls while the preceding asynchronous scan is unfinished.
function singleFlight(task, enabled = () => true) {
  let pending = null;
  return function (...args) {
    if (pending) return pending;
    if (!enabled()) return Promise.resolve();
    pending = Promise.resolve().then(() => task(...args)).finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { singleFlight };
