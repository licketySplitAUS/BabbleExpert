'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const LIMIT = 2000, MAX_FILE = 3 * 1024 * 1024;
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
const integer = (value, max = 10000) => Number.isInteger(value) && value >= 0 && value <= max;
const puzzleDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : '';
function snapshot(value) {
  if (!value?.ready || !/^(?:\d{1,12}|puzzle)$/.test(String(value.puzzleId)) || !/^[A-Z]{25}$/.test(value.gridLetters || '') ||
      !/^\d{1,5}$/.test(String(value.remaining)) || !Array.isArray(value.words) || value.words.length > 10000) return null;
  if (value.words.some(word => typeof word !== 'string' || !/^[a-z]{4,25}$/i.test(word))) return null;
  const words = [...new Set(value.words.map(word => word.toLowerCase()))], remaining = Number(value.remaining);
  if (!integer(remaining) || words.length + remaining < 1 || words.length + remaining > 10000) return null;
  const byLength = {}, longest = [];
  const maxLength = words.reduce((max, word) => Math.max(max, word.length), 0);
  for (const word of words) { byLength[word.length] = (byLength[word.length] || 0) + 1; if (word.length === maxLength && longest.length < 5) longest.push(word); }
  return { id: String(value.puzzleId) + '-' + createHash('sha256').update(value.gridLetters).digest('hex').slice(0, 16), puzzleId: String(value.puzzleId),
    puzzleDate: puzzleDate(value.puzzleDate), found: words.length, remaining, total: words.length + remaining, byLength, longest: longest.sort() };
}
function readRecord(record) {
  if (!record || !/^(?:\d{1,12}|puzzle)-[a-f0-9]{16}$/.test(record.id) || !/^(?:\d{1,12}|puzzle)$/.test(record.puzzleId) ||
      !record.id.startsWith(record.puzzleId + '-') || !iso(record.firstSeenAt) || !iso(record.lastSeenAt) ||
      !integer(record.initialFound) || !integer(record.found) || !integer(record.total) || record.found > record.total ||
      !integer(record.activeMs, 10 * 365 * 86400000) || typeof record.partial !== 'boolean' || typeof record.completionObserved !== 'boolean' ||
      (record.completedAt !== null && !iso(record.completedAt)) || !Array.isArray(record.longest) || record.longest.length > 5 || record.longest.some(word => !/^[a-z]{4,25}$/.test(word))) throw Error('Invalid journal');
  if (!record.byLength || typeof record.byLength !== 'object' || Array.isArray(record.byLength) ||
      Object.entries(record.byLength).some(([length, count]) => !/^(?:[4-9]|1\d|2[0-5])$/.test(length) || !integer(count)) ||
      Object.values(record.byLength).reduce((sum, count) => sum + count, 0) !== record.found) throw Error('Invalid journal');
  // Explicit fields only: neither restored files nor live pages can add extra data.
  return { id: record.id, puzzleId: record.puzzleId, puzzleDate: puzzleDate(record.puzzleDate), firstSeenAt: record.firstSeenAt, lastSeenAt: record.lastSeenAt,
    completedAt: record.completedAt, completionObserved: record.completionObserved, initialFound: record.initialFound, found: record.found, total: record.total,
    byLength: { ...record.byLength }, longest: [...record.longest], activeMs: record.activeMs, partial: record.partial };
}
class ProgressJournal {
  constructor({ file, enabled = false, now = Date.now, clock = () => performance.now(), checkpointMs = 15000 }) {
    this.file = file; this.enabled = enabled === true; this.now = now; this.clock = clock; this.checkpointMs = checkpointMs;
    this.records = new Map(); this.current = ''; this.lastClock = clock(); this.active = false; this.dirty = false; this.timer = null; this.blocked = false; this.error = '';
    try {
      if (fs.statSync(file).size > MAX_FILE) throw Error('Invalid journal');
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.records) || saved.records.length > LIMIT) throw Error('Invalid journal');
      for (const raw of saved.records) { const record = readRecord(raw); if (this.records.has(record.id)) throw Error('Invalid journal'); this.records.set(record.id, record); }
    } catch (error) {
      if (error.code !== 'ENOENT') { this.records.clear(); this.blocked = true; this.error = 'Your saved journal could not be read. The original file has been left untouched. Export is unavailable; clear the journal to start again.'; }
    }
  }
  _saveSoon() {
    this.dirty = true;
    if (!this.timer && !this.blocked) { this.timer = setTimeout(() => this.flush(), this.checkpointMs); this.timer.unref?.(); }
  }
  activity(active = false) {
    const time = this.clock(), elapsed = time - this.lastClock, record = this.records.get(this.current);
    // Do not credit sleep, stalled polls or time between application launches.
    if (this.enabled && this.active && record && !record.completedAt && elapsed >= 0 && elapsed <= 5000) {
      const ms = Math.round(elapsed);
      if (ms) { record.activeMs += ms; this._saveSoon(); }
    }
    this.lastClock = time; this.active = !!active && this.enabled && !!record && !record.completedAt;
  }
  suspend() { this.activity(false); }
  setEnabled(enabled) {
    this.suspend();
    if (this.enabled && !enabled) { const record = this.records.get(this.current); if (record && !record.completedAt) { record.partial = true; this._saveSoon(); } }
    this.enabled = enabled === true; this.current = ''; this.flush();
  }
  observe(value, { active = false } = {}) {
    if (!this.enabled || this.blocked) { this.suspend(); return false; }
    const state = snapshot(value);
    if (!state) { this.suspend(); this.current = ''; return false; }
    const same = this.current === state.id, previous = this.records.get(state.id);
    this.activity(false);
    const stamp = new Date(this.now()).toISOString();
    let record = previous;
    if (!record) {
      record = { id: state.id, puzzleId: state.puzzleId, puzzleDate: state.puzzleDate, firstSeenAt: stamp, lastSeenAt: stamp, completedAt: null,
        completionObserved: false, initialFound: state.found, found: state.found, total: state.total, byLength: state.byLength, longest: state.longest, activeMs: 0, partial: state.found > 0 };
      this.records.set(record.id, record);
      while (this.records.size > LIMIT) this.records.delete(this.records.keys().next().value);
    } else if ((!same && state.found > record.found) || state.total !== record.total || state.found < record.found) record.partial = true;
    const totalChanged = !!previous && state.total !== record.total;
    const wasUnfinished = !record.completedAt && record.found < record.total;
    // An official dictionary correction can add or remove words. Keep the
    // current totals consistent instead of retaining an impossible completion.
    if (totalChanged && state.remaining > 0) { record.completedAt = null; record.completionObserved = false; }
    if (state.found >= record.found || totalChanged) { record.found = state.found; record.total = state.total; record.byLength = state.byLength; record.longest = state.longest; }
    record.lastSeenAt = stamp;
    if (state.puzzleDate) record.puzzleDate = state.puzzleDate;
    if (state.remaining === 0 && !record.completedAt) { record.completedAt = stamp; record.completionObserved = !!previous && same && wasUnfinished && !totalChanged; }
    this.current = state.id; this.active = !!active && !record.completedAt;
    this._saveSoon(); return true;
  }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    if (this.blocked) return false;
    if (!this.dirty) return true;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const temporary = this.file + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, records: [...this.records.values()] }), { mode: 0o600 });
      fs.renameSync(temporary, this.file); this.dirty = false; this.error = ''; return true;
    } catch { this.error = 'The journal could not be saved. Your current records remain available while Expert is open; check that the device has free space and try again.'; return false; }
  }
  clear() {
    this.suspend();
    const old = this.records, blocked = this.blocked;
    this.records = new Map(); this.current = ''; this.blocked = false; this.dirty = true;
    if (this.flush()) return true;
    this.records = old; this.blocked = blocked; return false;
  }
  view() {
    return { enabled: this.enabled, active: this.active, error: this.error, blocked: this.blocked, limit: LIMIT,
      records: [...this.records.values()].sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt)).map(record => ({ ...record, byLength: { ...record.byLength }, longest: [...record.longest] })) };
  }
  csv() {
    if (this.blocked) throw Error('The saved journal could not be read.');
    const cell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const headings = ['Puzzle', 'Puzzle date', 'First recorded', 'Last observed', 'Completion observed at', 'Finished while tracking', 'Initially found', 'Found words', 'Total words', 'Recorded active seconds', 'Partial tracking', 'Longest observed words', ...Array.from({ length: 22 }, (_, i) => `${i + 4} letter words found`)];
    const lines = this.view().records.map(record => [record.puzzleId, record.puzzleDate, record.firstSeenAt, record.lastSeenAt, record.completedAt, record.completionObserved,
      record.initialFound, record.found, record.total, Math.round(record.activeMs / 1000), record.partial, record.longest.join(' '), ...Array.from({ length: 22 }, (_, i) => record.byLength[i + 4] || 0)]);
    return '\uFEFF' + [headings, ...lines].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }
}
module.exports = { ProgressJournal, journalSnapshot: snapshot };
