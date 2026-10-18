'use strict';
// Coalesce periodic calls while the preceding asynchronous scan is unfinished.
function singleFlight(task) {
  let pending = null;
  return function (...args) {
    if (pending) return pending;
    pending = Promise.resolve().then(() => task(...args)).finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { singleFlight };
