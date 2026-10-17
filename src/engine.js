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

function wordOutcome(message) {
  const text = String(message || '');
  if (/already entered|duplicate/i.test(text)) return 'duplicate';
  if (/last word added/i.test(text)) return 'added';
  if (/does not exist|not found in the dictionary|at least four|too short|not.valid/i.test(text)) return 'rejected';
  return 'unconfirmed';
}

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
    this.state = { ready: false, puzzleId: '', puzzleDate: '', gridLetters: '', cluesGridLetters: '', remaining: null, cluesOk: false, puzzleMatch: null, babbleConnection: 'loading', cluesConnection: 'loading', busy: false, pending: 0 };
    this.history = [];
    this._historyId = 0;
    this._submissionTail = Promise.resolve();
  }

  /** Both send buttons are enabled only when Babble is on a puzzle and the Clues page is loaded. */
  get canSend() {
    const s = this.state;
    return s.ready && s.puzzleId !== '' && s.cluesOk && s.puzzleMatch === true && !s.busy && !s.pending;
  }

  _set(patch) {
    const next = { ...this.state, ...patch };
    if (JSON.stringify(next) !== JSON.stringify(this.state)) { this.state = next; this.emit('state', next); }
  }
  status(text) { this.emit('status', text || ''); }

  /** tmrRemaining: runs every second. Mirrors the Delphi "ready" and "puzzle id" tracking. */
  async tick() {
    const cluesProbe = (this.pages.clues.state ? this.pages.clues.state() : this.pages.clues.ping().then(() => ({ ready: true })))
      .catch(e => ({ ready: false, error: e.message }));
    let st = null;
    let babbleError = '';
    try { st = await this.pages.babble.state(); } catch (e) { babbleError = e.message; }
    const clues = await cluesProbe;
    const cluesOk = !!clues.ready;
    const ready = !!(st && st.remaining != null && st.hasAddWord !== false);
    const puzzleId = st && st.puzzleId ? String(st.puzzleId) : '';
    const gridLetters = String(st?.gridLetters || ''), cluesGridLetters = String(clues.gridLetters || '');
    this._set({
      ready,
      puzzleId, puzzleDate: st?.puzzleDate || '', gridLetters, cluesGridLetters,
      puzzleMatch: /^[A-Z]{25}$/.test(gridLetters) && /^[A-Z]{25}$/.test(cluesGridLetters) ? gridLetters === cluesGridLetters : null,
      babbleConnection: ready ? 'ready' : st?.loginRequired ? 'login' : babbleError.includes('loading') ? 'loading' : st?.hasAddWord === false ? 'integration' : 'unavailable',
      cluesConnection: cluesOk ? 'ready' : clues.error?.includes('loading') ? 'loading' : 'unavailable',
      remaining: ready ? String(st.remaining) : null,
      cluesOk
    });
  }

  async addToBabble(word) {
    if (await this.alreadyInBabble(word)) return 'duplicate';
    const message = await this.pages.babble.addWord(word);
    const outcome = wordOutcome(message);
    if (outcome !== 'unconfirmed') return outcome;
    // Some compatible pages have no return message. Confirm against the actual
    // accepted word list; an empty/timeout response is never success by itself.
    if (await this.alreadyInBabble(word)) return 'added';
    return 'unconfirmed';
  }

  _transferAllowed() {
    if (!this.state.ready || !this.state.cluesOk) {
      this.status('Transfer paused: wait for both Babble and Clues to be ready.');
      return false;
    }
    if (this.state.puzzleMatch === false) {
      this.status('Transfer paused: Babble and Clues show different puzzles. Reload or update Clues first.');
      return false;
    }
    if (this.state.puzzleMatch === null) {
      this.status('Transfer paused: could not confirm that Babble and Clues show the same puzzle.');
      return false;
    }
    return true;
  }

  whenIdle() {
    if (!this.state.busy && !this.state.pending) return Promise.resolve();
    return new Promise(resolve => {
      const check = () => { if (!this.state.busy && !this.state.pending) { this.removeListener('state', check); resolve(); } };
      this.on('state', check);
    });
  }

  async alreadyInBabble(word) {
    if (!this.state.ready) return false;
    try { return (await this.pages.babble.words()).some(w => lower(w) === word); } catch { return false; }
  }

  /** "Send Words to Babble ->" : every ticked-and-correct Clues word that isn't already in the Babble grid. */
  async sendToBabble() {
    if (this.state.busy || this.state.pending || !this._transferAllowed()) return { sent: 0, skipped: true };
    this._set({ busy: true });
    try {
      const words = (await this.pages.clues.getAllWords()).map(lower).filter(Boolean);
      if (!words.length) { this.status('No ticked clue words to send'); return { sent: 0 }; }
      const inBabble = new Set((await this.pages.babble.words()).map(lower));
      this.emit('progress', { value: 0, max: words.length });
      let sent = 0, done = 0, rejected = 0, unconfirmed = 0, paused = false;
      for (const w of words) {
        if (!this._transferAllowed()) { paused = true; break; }
        if (!inBabble.has(w)) {
          let outcome;
          try { outcome = await this.addToBabble(w); } catch { outcome = 'unconfirmed'; }
          if (outcome === 'added') { inBabble.add(w); sent++; }
          else if (outcome === 'rejected') rejected++;
          else if (outcome === 'unconfirmed') { unconfirmed++; done++; paused = true; break; }
          if (this.pace) await sleep(this.pace);
        }
        this.emit('progress', { value: ++done, max: words.length });
      }
      this.status(`Added ${sent} new word${sent === 1 ? '' : 's'} to Babble${rejected ? `; ${rejected} rejected` : ''}${unconfirmed ? `; ${unconfirmed} not confirmed` : ''}${paused ? `; transfer paused (${words.length - done} entries not attempted). Check the connection and puzzle before trying again.` : ''}`);
      return { sent, rejected, unconfirmed };
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
    if (this.state.busy || this.state.pending || !this._transferAllowed()) return { skipped: true };
    this._set({ busy: true });
    try {
      const words = await this.pages.babble.words();
      this.emit('progress', { value: 0, max: Math.max(words.length, 1) });
      let added = 0, done = 0;
      for (const w of words) {
        if (!this._transferAllowed()) break;
        if ((await this.pages.clues.addBabbleWord(w)) === '1') added++;
        this.emit('progress', { value: ++done, max: Math.max(words.length, 1) });
      }
      await this.pages.clues.showAll();
      this.status(`Brought ${done} word${done === 1 ? '' : 's'} to Clues (${added} new)${done < words.length ? '; transfer paused because the puzzle or connection changed' : ''}`);
      return { total: done, added };
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
   *   green = confirmed by Babble, amber = duplicate or uncertain/Clues-only,
   *   red = explicit rejection, chat = submitted to the Chat form.
   */
  submit(text, ctrl = false) {
    const options = { ...this.getAddOptions() };
    const c = classify(text, { ctrl, ...options });
    if (c.kind === 'none') return Promise.resolve({ kind: 'none' });
    const entry = { id: ++this._historyId, text: String(text), ctrl, kind: c.kind, word: c.word || '', puzzleId: this.state.puzzleId, outcome: 'pending', message: `Sending ${c.kind === 'word' ? c.word : 'chat'}…` };
    this.history.unshift(entry);
    this.history = this.history.slice(0, 50);
    this.emit('history', this.history);
    this._set({ pending: this.state.pending + 1 });
    const task = this._submissionTail.then(async () => {
      let result;
      if (entry.puzzleId && this.state.puzzleId && entry.puzzleId !== this.state.puzzleId) {
        result = { kind: c.kind, color: 'amber', outcome: 'unconfirmed', sent: false, message: 'Puzzle changed before sending; restore the entry to try again.' };
      } else {
        try { result = await this._submit(text, ctrl, options); }
        catch (e) { result = { kind: c.kind, color: 'amber', outcome: 'unconfirmed', sent: false, message: `Could not confirm ${c.kind}: ${e.message}` }; }
      }
      Object.assign(entry, result);
      this.emit('history', this.history);
      this.status(result.message);
      return result;
    }).finally(() => this._set({ pending: Math.max(0, this.state.pending - 1) }));
    this._submissionTail = task.catch(() => {});
    return task;
  }

  async _submit(text, ctrl, options) {
    const c = classify(text, { ctrl, ...options });
    if (c.kind === 'none') return { kind: 'none' };

    if (c.kind === 'chat') {
      const msg = String(text).trim();
      if (!this.state.ready) return { kind: 'chat', color: 'amber', outcome: 'unconfirmed', sent: false, message: 'Babble not ready: chat not sent. Restore your draft from Recent entries.' };
      try {
        await this.pages.babble.addChat(msg);
        return { kind: 'chat', color: 'chat', outcome: 'submitted', sent: true, message: 'Chat submitted — check the chat pane for confirmation.' };
      } catch (e) { return { kind: 'chat', color: 'amber', outcome: 'unconfirmed', sent: false, message: `Chat could not be confirmed: ${e.message}. Restore your draft from Recent entries.` }; }
    }

    const w = c.word;
    let code = null;
    if (this.state.puzzleMatch !== false) {
      try { code = await this.pages.clues.addBabbleWord(w); }
      catch { /* Babble can still accept words while Clues is unavailable */ }
    }
    code = code == null ? '' : String(code).trim();
    try { await this.pages.clues.showAll(); } catch { /* ignore */ }
    let outcome = 'unconfirmed';
    if (w.length < 4) outcome = 'rejected';
    else if (this.state.ready) {
      try { outcome = await this.addToBabble(w); } catch { /* retain unconfirmed */ }
    }
    const savedToClues = code === '1' || code === '2';
    const color = outcome === 'added' ? 'green' : outcome === 'rejected' ? 'red' : 'amber';
    const message = outcome === 'added' ? `✓ Added to Babble: ${w}${!savedToClues ? ' (Clues not updated)' : ''}`
      : outcome === 'duplicate' ? `Already entered in Babble: ${w}`
      : outcome === 'rejected' ? `Not accepted by Babble: ${w}${w.length < 4 ? ' — words need at least four letters' : ''}`
      : savedToClues ? `Saved to Clues only: ${w} — Babble ${this.state.ready ? 'did not confirm it' : 'not ready'}`
      : `Could not confirm: ${w} — check Babble, then retry from Recent entries`;
    return { kind: 'word', word: w, color, code, outcome: outcome === 'unconfirmed' && savedToClues ? 'clues-only' : outcome, sent: outcome === 'added' || outcome === 'duplicate', message };
  }
}

module.exports = { Engine, classify, lower, wordOutcome };
