'use strict';
const { usernameReportFields } = require('./username-link');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const EVENTS = new Set(['startup-failed', 'process-failed', 'load-failed', 'load-slow', 'load-recovered', 'renderer-crashed', 'unresponsive', 'responsive', 'update-failed']);
const COMPONENTS = new Set(['main', 'babble', 'clues', 'resources', 'updater', 'tour', 'auxiliary']);
const REASONS = new Set(['exception', 'timeout', 'check', 'download', 'install', 'clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction', 'unknown']);
const validId = id => /^BE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(String(id || ''));
const numericVersion = value => typeof value === 'string' && value.length <= 32 && /^\d+(?:\.\d+){1,3}$/.test(value) ? value : undefined;
const errorTypes = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'AbortError']);
const modules = new Set(['main.js', 'app.js', 'pages.js', 'engine.js', 'updates.js', 'settings.js', 'tour.js', 'startup.js', 'diagnostics.js', 'local-window.js', 'page-runtime.js', 'async.js']);
const priority = item => ({ 'startup-failed': 100, 'process-failed': 100, 'renderer-crashed': 80, 'update-failed': 60, 'load-failed': 50, unresponsive: 40, 'load-slow': 10 }[item.event] || 0);
// Keep reports compatible with the existing service. Never send native messages,
// URLs or response bodies, even when a networking library wraps its error.
function updateErrorCode(error) {
  for (const item of [error, error?.cause]) {
    const status = item?.statusCode;
    if (Number.isInteger(status) && status >= 400 && status <= 599) return `ERR_HTTP_${status}`;
    const http = String(item?.code || '').match(/^HTTP_ERROR_([45]\d\d)$/);
    if (http) return `ERR_HTTP_${http[1]}`;
    if (/^(?:ERR_[A-Z0-9_]{1,60}|E[A-Z]{2,20})$/.test(String(item?.code || ''))) return item.code;
  }
  const message = typeof error?.message === 'string' ? error.message.slice(0, 8192) : '';
  // electron-updater sometimes embeds the original exception in a new Error.
  const network = message.match(/\b(?:net::)?(ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_TIMED_OUT|ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ERR_NETWORK_CHANGED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ENETUNREACH)\b/);
  if (network) return network[1];
  if (error?.name === 'AbortError') return 'ERR_UPDATE_ABORTED';
  return 'ERR_UPDATE_UNKNOWN';
}
function exceptionDetails(error) {
  const match = typeof error?.stack === 'string' && error.stack.match(/[\\/]src[\\/]([a-z-]+\.js):(\d+):\d+/i);
  return { code: error?.code, ...(errorTypes.has(error?.name) ? { errorType: error.name } : {}),
    ...(match && modules.has(match[1]) ? { source: match[1], line: Number(match[2]) } : {}) };
}
function safeDetails(event, data = {}) {
  if (!data || !EVENTS.has(event) || !COMPONENTS.has(data.component)) return null;
  const safe = { event, component: data.component };
  if (REASONS.has(data.reason)) safe.reason = data.reason;
  if (Number.isInteger(data.code) && Math.abs(data.code) < 1000000) safe.code = data.code;
  else if (/^(?:ERR_[A-Z0-9_]{1,60}|E[A-Z]{2,20})$/.test(String(data.code || ''))) safe.code = data.code;
  if (Number.isFinite(data.elapsedMs)) safe.elapsedMs = Math.max(0, Math.min(86400000, Math.round(data.elapsedMs)));
  if (numericVersion(data.targetVersion)) safe.targetVersion = data.targetVersion;
  if (errorTypes.has(data.errorType)) safe.errorType = data.errorType;
  if (modules.has(data.source) && Number.isInteger(data.line) && data.line > 0 && data.line < 100000) { safe.source = data.source; safe.line = data.line; }
  if (Number.isInteger(data.count)) safe.count = Math.max(1, Math.min(9999, data.count));
  return safe;
}

// Can run before createApp succeeds. Only read the existing sharing preference;
// unreadable settings or a first run do not imply permission to send anything.
function readDiagnosticConsent(userDataDir) {
  try { return JSON.parse(fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf8')); }
  catch { return {}; }
}

function createDiagnostics({ userDataDir, version, endpoint = 'https://selfserve.r46.me/api/expert-diagnostics',
  getConsent = () => readDiagnosticConsent(userDataDir), fetchImpl = globalThis.fetch,
  platform = process.platform, architecture = process.arch, now = Date.now }) {
  const file = path.join(userDataDir, 'pending-diagnostics.json');
  let consentReader = getConsent;
  let queue = [], running = null, retryAfter = 0;
  const seen = new Map(), recent = [];
  let inFlightId = null;
  const save = () => {
    try {
      if (!queue.length) { fs.rmSync(file, { force: true }); return; }
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(queue));
      fs.renameSync(file + '.tmp', file);
    } catch { /* Diagnostics must not break the app. */ }
  };
  const consent = () => { try { return consentReader() || {}; } catch { return {}; } };
  const permitted = () => {
    const settings = consent();
    if (!endpoint || settings.usageSharing !== true || !validId(settings.anonymousId)) {
      queue = []; save(); return null;
    }
    const recent = queue.filter(item => { const age = now() - Date.parse(item.occurredAt); return age >= 0 && age < 7 * 86400000; });
    if (recent.length !== queue.length) { queue = recent; save(); }
    return settings;
  };
  try {
    if (fs.statSync(file).size <= 32768) {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(saved)) queue = saved.slice(-20).flatMap(item => {
        const details = safeDetails(item?.event, item);
        const age = now() - Date.parse(item?.occurredAt);
        if (!details || !(age >= 0 && age < 7 * 86400000) || !/^[a-f0-9-]{36}$/.test(item.reportId || '') || !validId(item.anonymousId)) return [];
        return [{ ...details, reportId: item.reportId, occurredAt: item.occurredAt, anonymousId: item.anonymousId,
          version: numericVersion(item.version) || '0.0.0',
          platform: ['win32', 'darwin', 'linux'].includes(item.platform) ? item.platform : platform,
          architecture: ['x64', 'arm64', 'ia32', 'arm'].includes(item.architecture) ? item.architecture : architecture,
          osRelease: typeof item.osRelease === 'string' && /^[\d.]{1,32}$/.test(item.osRelease) ? item.osRelease : undefined,
          memoryMB: Number.isInteger(item.memoryMB) && item.memoryMB > 0 && item.memoryMB <= 16777216 ? item.memoryMB : undefined }];
      });
    }
  } catch { /* No saved diagnostics. */ }
  permitted(); save();
  function flush() {
    if (running) return running;
    if (!permitted() || now() < retryAfter || typeof fetchImpl !== 'function') return Promise.resolve(false);
    running = (async () => {
      while (queue.length) {
        const settings = permitted();
        if (!settings) return false;
        // Expiry or an opt-out can empty the queue between requests.
        if (!queue.length) break;
        const item = queue[0];
        if (item.anonymousId !== settings.anonymousId) { queue.shift(); save(); continue; }
        const controller = new AbortController();
        inFlightId = item.reportId;
        const timer = setTimeout(() => controller.abort(), 7000);
        timer.unref?.();
        try {
          const response = await fetchImpl(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...item, ...usernameReportFields(settings.usernameLink, Date.parse(item.occurredAt)) }), signal: controller.signal });
          if (!response.ok && ![400, 413].includes(response.status)) { retryAfter = now() + 60000; return false; }
          // A preference change may have cleared the queue during this request.
          queue = queue.filter(row => row.reportId !== item.reportId);
          save();
        } catch { retryAfter = now() + 60000; return false; }
        finally { clearTimeout(timer); inFlightId = null; }
      }
      return true;
    })().finally(() => { running = null; });
    return running;
  }
  function report(event, details) {
    const safe = safeDetails(event, details);
    if (!safe) return false;
    recent.push({ ...safe, occurredAt: new Date(now()).toISOString() }); if (recent.length > 20) recent.shift();
    const settings = permitted();
    if (!settings) return false;
    const key = [event, safe.component, safe.reason, safe.code].join(':');
    if (seen.has(key)) {
      const record = seen.get(key); record.count = Math.min(9999, (record.count || 1) + 1);
      const pending = queue.find(row => row.reportId === record.reportId);
      if (pending) { pending.count = record.count; save(); }
      return false;
    }
    if (seen.size >= 20) {
      const victim = [...seen].sort((a, b) => priority(a[1]) - priority(b[1]))[0];
      if (priority(victim[1]) >= priority(safe) && priority(safe) < 80) return false;
      seen.delete(victim[0]);
    }
    if (queue.length >= 20) {
      const victim = queue.filter(item => item.reportId !== inFlightId).sort((a, b) => priority(a) - priority(b))[0];
      if (!victim || (priority(victim) >= priority(safe) && priority(safe) < 80)) return false;
      queue = queue.filter(item => item !== victim);
    }
    const record = { ...safe, count: 1, reportId: randomUUID(), occurredAt: new Date(now()).toISOString(), version: numericVersion(version) || '0.0.0',
      anonymousId: settings.anonymousId, platform, architecture, osRelease: os.release().replace(/[^\d.]/g, '').slice(0, 32), memoryMB: Math.round(os.totalmem() / 1048576) };
    seen.set(key, record);
    queue.push(record); queue.sort((a, b) => priority(b) - priority(a));
    save();
    void flush();
    return true;
  }
  async function flushWithin(ms = 1500) {
    let timer;
    try { await Promise.race([flush(), new Promise(resolve => { timer = setTimeout(resolve, ms); })]); }
    finally { clearTimeout(timer); }
  }
  return { report, flush, flushWithin, recent: () => recent.map(item => ({ ...item })), useSettings: settings => { consentReader = () => settings.data; permitted(); }, preferenceChanged: () => { permitted(); } };
}

// Observe only top-level loading. URLs, page text, native error messages and
// stack traces are deliberately never passed to the reporting service.
function watchPageDiagnostics(wc, component, report = () => {}, { slowMs = 30000, now = Date.now } = {}) {
  let timer = null, started = 0, loading = false, slow = false, unresponsive = false, unresponsiveAt = 0;
  const clear = () => { clearTimeout(timer); timer = null; };
  wc.on('did-start-navigation', (_event, url, inPlace, mainFrame) => {
    if (!mainFrame || inPlace || !/^(https?:|file:)/.test(url)) return;
    clear(); started = now(); loading = true; slow = false;
    timer = setTimeout(() => { slow = true; report('load-slow', { component, reason: 'timeout', elapsedMs: now() - started }); }, slowMs);
    timer.unref?.();
  });
  wc.on('did-finish-load', () => {
    clear();
    if (loading && slow) report('load-recovered', { component, elapsedMs: now() - started });
    loading = false;
  });
  wc.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
    if (!mainFrame) return;
    clear(); loading = false;
    if (code !== -3) report('load-failed', { component, code });
  });
  wc.on('render-process-gone', (_event, details) => { clear(); report('renderer-crashed', { component, reason: details.reason, code: details.exitCode }); });
  wc.on('unresponsive', () => {
    if (unresponsive) return;
    unresponsive = true; unresponsiveAt = now(); report('unresponsive', { component });
  });
  wc.on('responsive', () => { if (unresponsive) report('responsive', { component, elapsedMs: now() - unresponsiveAt }); unresponsive = false; });
  wc.once('destroyed', clear);
  return clear;
}

module.exports = { createDiagnostics, readDiagnosticConsent, safeDetails, watchPageDiagnostics, exceptionDetails, updateErrorCode };
