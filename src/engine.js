'use strict';
/*
 * The "brain": everything the Delphi program did when a button was pressed or Enter was hit in
 * Lickety Add. It has no Electron code in it, so it is unit-tested on its own.
 *
 * `pages` is the thing that talks to the two web pages (see pages.js):
 *   pages.babble.{state, words, addWord, addChat}
 *   pages.clues.{ping, getAllWords, addBabbleWord, showAll}
 */
const { EventEmitter } = require('node:events');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const lower = s => String(s).trim().toLowerCase();

/**
 * Decide what Enter does in the Add box (TfrmBabble.mmoAddKeyUp).
 *  - Ctrl+Enter always goes to Chat.
 *  - A single word of 3+ letters (or anything, if "No Chat" is on) is a word for Clues + Babble.
 *  - Anything else is a Chat message.
 */
function classify(text, { ctrl = false, noChat = false, dontClear = false } = {}) {
  const t = String(text).trim();
  if (!t) return { kind: 'none' };
  if (ctrl) return { kind: 'chat', clear: true };
  if (noChat || (!/\s/.test(t) && t.length >= 3)) {
    const word = lower(String(text).replace(/[\r\n]/g, ''));
    return { kind: 'word', word, clear: !dontClear, keep: dontClear ? word : '' };
  }
  return { kind: 'chat', clear: true };
}

class Engine extends EventEmitter {
  constructor({ pages, getAddOptions = () => ({}), pace = 100 }) {
    super();
    this.pages = pages;
    this.getAddOptions = getAddOptions;
    this.pace = pace;                       // ms between words sent to Babble, so the site isn't hammered
    this.state = { ready: false, puzzleId: '', remaining: null, cluesOk: false, busy: false };
  }

  /** Both send buttons are enabled only when Babble is on a puzzle and the Clues page is loaded. */
  get canSend() {
    const s = this.state;
    return s.ready && s.puzzleId !== '' && s.cluesOk && !s.busy;
  }

  _set(patch) {
    const next = { ...this.state, ...patch };
    if (JSON.stringify(next) !== JSON.stringify(this.state)) { this.state = next; this.emit('state', next); }
  }
  status(text) { this.emit('status', text || ''); }

  /** tmrRemaining: runs every second. Mirrors the Delphi "ready" and "puzzle id" tracking. */
  async tick() {
    const cluesProbe = this.pages.clues.ping().then(() => true, () => false);
    let st = null;
    try { st = await this.pages.babble.state(); } catch { /* not on a Babble page yet */ }
    const cluesOk = await cluesProbe;
    const ready = !!(st && st.remaining != null);
    this._set({
      ready,
      puzzleId: st && st.puzzleId ? String(st.puzzleId) : '',
      remaining: ready ? String(st.remaining) : null,
      cluesOk
    });
  }

  async alreadyInBabble(word) {
    if (!this.state.ready) return false;
    try { return (await this.pages.babble.words()).some(w => lower(w) === word); } catch { return false; }
  }

  /** "Send Words to Babble ->" : every ticked-and-correct Clues word that isn't already in the Babble grid. */
  async sendToBabble() {
    if (this.state.busy) return { sent: 0, skipped: true };
    this._set({ busy: true });
    try {
      const words = (await this.pages.clues.getAllWords()).map(lower).filter(Boolean);
      if (!words.length) { this.status('No ticked clue words to send'); return { sent: 0 }; }
      const inBabble = new Set((await this.pages.babble.words()).map(lower));
      this.emit('progress', { value: 0, max: words.length });
      let sent = 0, done = 0;
      for (const w of words) {
        if (!inBabble.has(w)) {
          this.status(String((await this.pages.babble.addWord(w)) || w));
          inBabble.add(w); sent++;
          if (this.pace) await sleep(this.pace);
        }
        this.emit('progress', { value: ++done, max: words.length });
      }
      this.status(`Sent ${sent} new word${sent === 1 ? '' : 's'} to Babble`);
      return { sent };
    } catch (e) {
      this.status('Could not send: ' + e.message);
      return { error: e.message };
    } finally {
      this._set({ busy: false });
      this.emit('progress', { value: 0, max: 1 });
    }
  }

  /** "<- Send Words to Clues" : tick every Babble grid word on the Clues page that is a clue in this puzzle. */
  async getFromBabble() {
    if (this.state.busy) return { skipped: true };
    this._set({ busy: true });
    try {
      const words = await this.pages.babble.words();
      this.emit('progress', { value: 0, max: Math.max(words.length, 1) });
      let added = 0, done = 0;
      for (const w of words) {
        if ((await this.pages.clues.addBabbleWord(w)) === '1') added++;
        this.emit('progress', { value: ++done, max: Math.max(words.length, 1) });
      }
      await this.pages.clues.showAll();
      this.status(`Brought ${words.length} word${words.length === 1 ? '' : 's'} to Clues (${added} new)`);
      return { total: words.length, added };
    } catch (e) {
      this.status('Could not read Babble: ' + e.message);
      return { error: e.message };
    } finally {
      this._set({ busy: false });
      this.emit('progress', { value: 0, max: 1 });
    }
  }

  /**
   * Enter pressed in Lickety Add. Returns {kind, color}; color is the flash:
   *   green = newly ticked on Clues, amber = already ticked, red = not a clue in this puzzle, chat = sent to Chat.
   */
  async submit(text, ctrl = false) {
    const c = classify(text, { ctrl, ...this.getAddOptions() });
    if (c.kind === 'none') return { kind: 'none' };

    if (c.kind === 'chat') {
      const msg = String(text).trim();
      if (!this.state.ready) { this.status('Babble not ready: chat not sent'); return { kind: 'chat', color: 'chat', sent: false }; }
      try { this.status(String((await this.pages.babble.addChat(msg)) || '')); }
      catch (e) { this.status('Chat failed: ' + e.message); }
      return { kind: 'chat', color: 'chat', sent: true };
    }

    const w = c.word;
    let code = null;
    try { code = await this.pages.clues.addBabbleWord(w); }
    catch (e) { this.status('Clues page not ready: ' + e.message); }
    const color = code === null || code === '0' ? 'red' : code === '2' ? 'amber' : 'green';
    try { await this.pages.clues.showAll(); } catch { /* ignore */ }

    if (w.length >= 4 && !(await this.alreadyInBabble(w))) {
      if (!this.state.ready) this.status('Babble not ready: word saved to Clues only');
      else {
        try { this.status(String((await this.pages.babble.addWord(w)) || '')); }
        catch (e) { this.status('Babble: ' + e.message); }
      }
    }
    return { kind: 'word', color, code };
  }
}

module.exports = { Engine, classify, lower };
