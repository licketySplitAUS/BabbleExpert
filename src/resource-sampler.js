'use strict';
const os = require('node:os');
// One bounded sample of Expert's process group, not other applications. Keep
// process IDs/names local; only aggregate measurements can enter diagnostics.
function createResourceSampler({ getMetrics, enabled, now = Date.now, freeMemory = os.freemem,
  logicalCPUs = () => os.cpus().length, powerMonitor, intervalMs = 30000 }) {
  let previous = null, sample = null, timer = null, sleeping = false;
  const reset = () => { previous = null; sample = null; };
  function tick() {
    if (sleeping || !enabled()) { reset(); return; }
    try {
      const metrics = getMetrics().slice(0, 128), time = now(), cpus = logicalCPUs();
      if (!metrics.length || !Number.isInteger(cpus) || cpus < 1) { reset(); return; }
      const total = field => metrics.every(row => Number.isFinite(row.memory?.[field]) && row.memory[field] >= 0)
        ? Math.round(metrics.reduce((sum, row) => sum + row.memory[field], 0) / 1024) : undefined;
      sample = { sampledAt: time, appWorkingSetMB: total('workingSetSize'), appPrivateMB: total('privateBytes'),
        freeMemoryMB: Math.round(freeMemory() / 1048576) };
      const seconds = previous && (time - previous.time) / 1000;
      if (seconds >= 5 && seconds <= 90) {
        // Cumulative deltas avoid shared getAppMetrics callers resetting CPU
        // intervals. Skip new/recycled processes until a baseline exists.
        let cpuSeconds = 0, known = 0;
        for (const row of metrics) {
          const before = previous.rows.get(row.pid + ':' + row.creationTime), after = row.cpu?.cumulativeCPUUsage;
          if (Number.isFinite(before) && Number.isFinite(after) && after >= before) { cpuSeconds += after - before; known++; }
        }
        if (known === metrics.length) {
          sample.appCpuPercent = Math.min(100, Math.round(cpuSeconds / seconds / cpus * 1000) / 10);
          sample.sampleWindowSeconds = Math.round(seconds);
        }
      }
      previous = { time, rows: new Map(metrics.map(row => [row.pid + ':' + row.creationTime, row.cpu?.cumulativeCPUUsage])) };
    } catch { reset(); }
  }
  const suspend = () => { sleeping = true; reset(); };
  const resume = () => { sleeping = false; reset(); tick(); };
  powerMonitor?.on('suspend', suspend); powerMonitor?.on('resume', resume);
  tick(); timer = setInterval(tick, intervalMs); timer.unref?.();
  return {
    tick,
    snapshot() {
      if (!enabled() || sleeping) { reset(); return {}; }
      // Refresh for an incident after five seconds, so early startup failures
      // can get a meaningful CPU interval without frequent idle polling.
      if (!sample || now() - sample.sampledAt >= 5000 || now() < sample.sampledAt) tick();
      if (!sample) return {};
      const { sampledAt, ...details } = sample;
      return { ...details, sampleAgeSeconds: Math.max(0, Math.round((now() - sampledAt) / 1000)) };
    },
    stop() { clearInterval(timer); powerMonitor?.removeListener('suspend', suspend); powerMonitor?.removeListener('resume', resume); reset(); }
  };
}
module.exports = { createResourceSampler };
