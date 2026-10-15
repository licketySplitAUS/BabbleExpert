'use strict';
/* Replaces BabbleExpert.ini: a small JSON file in the user's app-data folder. */
const fs = require('node:fs');
const path = require('node:path');

const FONT_SIZES = ['10pt', '13pt', '16pt', '20pt', '24pt', '36pt'];
const DEFAULTS = {
  yellow: false, switchSides: false, hideHints: false, clueSource: 'lickety',
  cluesW: 260, resW: 380,
  window: null,                       // {x, y, width, height, maximized}
  add: { visible: false, noChat: false, thin: false, dontClear: false, speed: 3, fontSize: '20pt', bounds: null }
};

const isBool = v => typeof v === 'boolean';
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

class Settings {
  constructor(file) {
    this.file = file;
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    this._timer = null;
    this._load();
  }

  _load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.patch({ ...saved, add: { ...(saved.add || {}) } }, { silent: true });
      if (saved.window && isNum(saved.window.width, 300, 10000) && isNum(saved.window.height, 200, 10000)) this.data.window = saved.window;
      if (saved.add && saved.add.bounds && isNum(saved.add.bounds.width, 100, 5000) && isNum(saved.add.bounds.height, 50, 3000)) this.data.add.bounds = saved.add.bounds;
    } catch { /* first run or unreadable file: use defaults */ }
  }

  /** Apply a partial update, ignoring anything that isn't a known key of the right type. Returns true if something changed. */
  patch(p, { silent = false } = {}) {
    const d = this.data, before = JSON.stringify(d);
    for (const k of ['yellow', 'switchSides', 'hideHints']) if (isBool(p[k])) d[k] = p[k];
    if (['lickety', 'selfServe'].includes(p.clueSource)) d.clueSource = p.clueSource;
    if (isNum(p.cluesW, 120, 3000)) d.cluesW = Math.round(p.cluesW);
    if (isNum(p.resW, 80, 3000)) d.resW = Math.round(p.resW);
    if (p.add && typeof p.add === 'object') {
      const a = p.add;
      for (const k of ['visible', 'noChat', 'thin', 'dontClear']) if (isBool(a[k])) d.add[k] = a[k];
      if (Number.isInteger(a.speed) && a.speed >= 0 && a.speed <= 5) d.add.speed = a.speed;
      if (FONT_SIZES.includes(a.fontSize)) d.add.fontSize = a.fontSize;
    }
    const changed = JSON.stringify(d) !== before;
    if (changed && !silent) this.save();
    return changed;
  }

  setWindow(w) { this.data.window = w; this.save(); }
  setAddBounds(b) { this.data.add.bounds = b; this.save(); }

  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 300);
  }
  flush() {
    clearTimeout(this._timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch { /* a settings write failing must never break the app */ }
  }
}

module.exports = { Settings, DEFAULTS, FONT_SIZES };
