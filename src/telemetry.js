'use strict';

const EVENTS = new Set(['install', 'upgrade', 'resource', 'option', 'startup', 'session']);
const { effectID } = require('./celebration-pack');
const { usernameReportFields } = require('./username-link');

function createTelemetry({ endpoint, enabled, version, anonymousId, getUsernameLink, cityEnabled = () => false, fetchImpl = globalThis.fetch, platform = process.platform, architecture = process.arch }) {
  let startupAttempted = false;
  async function send(event, details) {
    if (!endpoint || !enabled() || !EVENTS.has(event) || typeof fetchImpl !== 'function') return false;
    // One attempt per running app, including concurrent calls after opt-in.
    if (event === 'startup') {
      if (startupAttempted) return false;
      startupAttempted = true;
    }
    const extra = typeof details === 'string' ? { item: details } : (details && typeof details === 'object' ? details : {});
    const safeExtra = {};
    if (typeof extra.item === 'string' && extra.item) safeExtra.item = extra.item.slice(0, 80);
    if (['resource', 'option'].includes(event) && /^Fireworks(?: replay)?$/.test(extra.item) && effectID(extra.animation)) safeExtra.animation = extra.animation;
    if (['resource', 'option'].includes(event) && /^Fireworks(?: replay)?$/.test(extra.item)) {
      if (['bundled', 'cached', 'downloaded'].includes(extra.packSource)) safeExtra.packSource = extra.packSource;
      if (/^(?:bundled|[a-f0-9]{12})$/.test(String(extra.packRevision || ''))) safeExtra.packRevision = extra.packRevision;
    }
    if (['resource', 'option'].includes(event) && /^Fireworks(?: replay)?$/.test(extra.item) && ['completion', 'preview', 'replay', 'reload'].includes(extra.trigger)) safeExtra.trigger = extra.trigger;
    if (typeof extra.previousVersion === 'string') safeExtra.previousVersion = extra.previousVersion.slice(0, 24);
    if (Number.isFinite(extra.durationSeconds)) safeExtra.durationSeconds = Math.max(0, Math.round(extra.durationSeconds));
    const controller = new AbortController();
    // Allow the server's bounded Discord request plus alias/storage work.
    const timer = setTimeout(() => controller.abort(), 12000);
    if (timer.unref) timer.unref();
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event, version, platform, architecture, anonymousId, ...(cityEnabled() === true ? { locationConsentVersion: 3 } : {}),
          ...(getUsernameLink ? usernameReportFields(getUsernameLink()) : {}), ...safeExtra }),
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
