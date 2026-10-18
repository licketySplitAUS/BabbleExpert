'use strict';

const EVENTS = new Set(['install', 'upgrade', 'resource', 'option', 'session']);

function createTelemetry({ endpoint, enabled, version, anonymousId, cityEnabled = () => false, fetchImpl = globalThis.fetch, platform = process.platform, architecture = process.arch }) {
  async function send(event, details) {
    if (!endpoint || !enabled() || !EVENTS.has(event) || typeof fetchImpl !== 'function') return false;
    const extra = typeof details === 'string' ? { item: details } : (details && typeof details === 'object' ? details : {});
    const safeExtra = {};
    if (typeof extra.item === 'string' && extra.item) safeExtra.item = extra.item.slice(0, 80);
    if (typeof extra.previousVersion === 'string') safeExtra.previousVersion = extra.previousVersion.slice(0, 24);
    if (Number.isFinite(extra.durationSeconds)) safeExtra.durationSeconds = Math.max(0, Math.round(extra.durationSeconds));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    if (timer.unref) timer.unref();
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event, version, platform, architecture, anonymousId, ...(cityEnabled() === true ? { locationConsentVersion: 3 } : {}), ...safeExtra }),
        keepalive: event === 'session',
        signal: controller.signal
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  return { send };
}

module.exports = { createTelemetry, EVENTS };
