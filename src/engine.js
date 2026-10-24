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
const { findGridPaths } = require('./babble-glow');

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
 *  - Multiline and oversized entries are never sent.
 *  - A single word of 3+ letters (or anything, if "No Chat" is on) is a word for Clues + Babble.
 *  - Ordinary text goes to chat; suspected word lists need explicit Ctrl+Enter.
 */
function classify(text, { ctrl = false, noChat = false, dontClear = false, gridLetters = '' } = {}) {
  const t = String(text).trim();
  if (!t) return { kind: 'none' };
  if (/[\r\n\u2028\u2029]/.test(t) || t.length > 500) return {
    kind: 'blocked', clear: false,
    message: 'Not sent: multiline lists and entries over 500 characters are blocked. Enter one word at a time; Expert syncs words between Babble and Clues.'
  };
  if (ctrl) return { kind: 'chat', clear: true };
  const words = t.toLowerCase().split(/[\s,;]+/);
  if (words.length >= 3 && words.every(word => /^[a-z]{4,25}$/.test(word))) {
    // A run of words that can actually be traced on today's board is stronger
    // evidence than word length alone. Sorting and repeated delimiters also
    // identify common copied lists when the grid is unavailable.
    const delimited = t.split(/[,;\t]+/).filter(part => part.trim()).length >= 4;
    const sorted = words.length >= 5 && words.every((word, i) => !i || words[i - 1] <= word);
    const onGrid = /^[A-Z]{25}$/.test(gridLetters) &&
      words.filter(word => findGridPaths([...gridLetters], 5, word, 1).length).length >= Math.max(3, Math.ceil(words.length * .75));
    if (delimited || sorted || onGrid) return {
      kind: 'blocked', clear: false,
      message: 'Not sent: this looks like a Babble word list. Expert syncs words automatically. If you meant to chat, use Ctrl+Enter (Mac: ⌘+Enter).'
    };
  }
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
    this._nativeContext = null;
    this._clueRevision = 0;
    this._nativeSyncing = false;
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

  async addToBabble(word, valid = () => true) {
    if (!valid()) return 'unconfirmed';
    if (this.pages.babble.setWordEntry) await this.pages.babble.setWordEntry(word);
    if (!valid()) return 'unconfirmed';
    if (await this.alreadyInBabble(word)) return 'duplicate';
    if (!valid()) return 'unconfirmed';
    const message = await this.pages.babble.addWord(word, valid);
    if (!valid()) return 'unconfirmed';
    const outcome = wordOutcome(message);
    if (outcome !== 'unconfirmed') return outcome;
    // Some compatible pages have no return message. Confirm against the actual
    // accepted word list; an empty/timeout response is never success by itself.
    if (await this.alreadyInBabble(word)) return 'added';
    return 'unconfirmed';
  }

  cluesPageChanged() {
    this._clueRevision++;
    this._set({ cluesOk: false, puzzleMatch: null });
  }

  /** Reconcile actual accepted lists, including saved words and newly loaded clue pages. */
  async syncNativeWords() {
    if (this._nativeSyncing || this.state.busy || this.state.pending ||
        !this.state.ready || !this.state.cluesOk || this.state.puzzleMatch !== true) return;
    this._nativeSyncing = true;
    const key = this.state.puzzleId + ':' + this.state.gridLetters;
    const revision = this._clueRevision;
    const valid = () => this.state.puzzleId + ':' + this.state.gridLetters === key &&
      this._clueRevision === revision && this.state.ready && this.state.cluesOk && this.state.puzzleMatch === true;
    let pending = false;
    try {
      const [babbleWords, clueWords] = await Promise.all([this.pages.babble.words(), this.pages.clues.getAllWords()]);
      if (!valid() || this.state.busy || this.state.pending) return;
      const babble = new Set(babbleWords.map(lower).filter(Boolean));
      const clues = new Set(clueWords.map(lower).filter(Boolean));
      // Share the accepted list already read by reconciliation; resources need
      // no second DOM query or per-word requests to restore found-word colours.
      this.emit('accepted-words', { puzzleId: this.state.puzzleId, gridLetters: this.state.gridLetters, words: [...babble] });
      if (!this._nativeContext || this._nativeContext.key !== key || this._nativeContext.revision !== revision) {
        this._nativeContext = { key, revision, unavailableClues: new Set(), babbleFailures: new Map() };
      }
      const context = this._nativeContext;
      for (const word of context.babbleFailures.keys()) {
        if (!clues.has(word) || babble.has(word)) context.babbleFailures.delete(word);
      }
      const toClues = [...babble].filter(word => !clues.has(word) && !context.unavailableClues.has(word));
      const toBabble = [...clues].filter(word => !babble.has(word) &&
        !(context.babbleFailures.get(word) > Date.now()));
      if (!toClues.length && !toBabble.length) return;
      pending = true;
      this._set({ pending: this.state.pending + 1 });
      let changedClues = false;
      for (const word of toClues) {
        if (!valid()) return;
        try {
          const code = String(await this.pages.clues.addBabbleWord(word));
          if (code === '1') changedClues = true;
          // Babble sometimes accepts words omitted from a clue source.
          if (code === '0') context.unavailableClues.add(word);
        } catch { /* Retry this missing word on the next poll. */ }
      }
      if (changedClues && valid()) await this.pages.clues.showAll();
      for (const word of toBabble) {
        if (!valid()) return;
        // Share the submission queue with Lickety Add, avoiding duplicate sends.
        const task = this._submissionTail.then(async () => {
          if (!valid()) return 'unconfirmed';
          return this.addToBabble(word, valid);
        });
        this._submissionTail = task.catch(() => {});
        let outcome;
        try { outcome = await task; } catch { outcome = 'unconfirmed'; }
        if (!valid()) return;
        if (outcome === 'rejected') {
          context.babbleFailures.set(word, Infinity);
          this.status('Babble did not accept ' + word + '; it remains checked in Clues.');
        } else if (outcome === 'unconfirmed') {
          context.babbleFailures.set(word, Date.now() + 5000);
          this.status('Could not confirm ' + word + ' in Babble; will retry automatically.');
        } else context.babbleFailures.delete(word);
        // One failed word must not prevent later words from being sent.
        if (this.pace) await sleep(this.pace);
      }
    } catch { /* A later poll will reconcile any words still missing. */ }
    finally {
      this._nativeSyncing = false;
      if (pending) this._set({ pending: Math.max(0, this.state.pending - 1) });
    }
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

  whenIdle(timeoutMs = 15000) {
    if (!this.state.busy && !this.state.pending) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.removeListener('state', check); reject(Object.assign(new Error('Entries are still being processed. Check Babble and retry the update when they finish.'), { code: 'ERR_ENTRIES_BUSY' })); }, timeoutMs);
      const check = () => { if (!this.state.busy && !this.state.pending) { clearTimeout(timer); this.removeListener('state', check); resolve(); } };
      this.on('state', check);
    });
  }

  transferContext() {
    const key = this.state.puzzleId + ':' + this.state.gridLetters, revision = this._clueRevision;
    return () => key === this.state.puzzleId + ':' + this.state.gridLetters && revision === this._clueRevision && this._transferAllowed();
  }

  async alreadyInBabble(word) {
    if (!this.state.ready) return false;
    try { return (await this.pages.babble.words()).some(w => lower(w) === word); } catch { return false; }
  }

  /** "Send Words to Babble ->" : every ticked-and-correct Clues word that isn't already in the Babble grid. */
  async sendToBabble() {
    if (this.state.busy || this.state.pending || !this._transferAllowed()) return { sent: 0, skipped: true };
    this._set({ busy: true });
    const valid = this.transferContext();
    try {
      const words = (await this.pages.clues.getAllWords()).map(lower).filter(Boolean);
      if (!words.length) { this.status('No ticked clue words to send'); return { sent: 0 }; }
      const inBabble = new Set((await this.pages.babble.words()).map(lower));
      this.emit('progress', { value: 0, max: words.length });
      let sent = 0, done = 0, rejected = 0, unconfirmed = 0, paused = false;
      for (const w of words) {
        if (!valid()) { paused = true; break; }
        if (!inBabble.has(w)) {
          let outcome;
          try { outcome = await this.addToBabble(w, valid); } catch { outcome = 'unconfirmed'; }
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
    const valid = this.transferContext();
    try {
      const words = await this.pages.babble.words();
      this.emit('progress', { value: 0, max: Math.max(words.length, 1) });
      let added = 0, done = 0;
      for (const w of words) {
        if (!valid()) break;
        if ((await this.pages.clues.addBabbleWord(w)) === '1') added++;
        this.emit('progress', { value: ++done, max: Math.max(words.length, 1) });
      }
      if (valid()) await this.pages.clues.showAll();
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
    const options = { ...this.getAddOptions(), gridLetters: this.state.ready ? this.state.gridLetters : '' };
    const c = classify(text, { ctrl, ...options });
    if (c.kind === 'none') return Promise.resolve({ kind: 'none' });
    if (c.kind === 'blocked') return Promise.resolve({ ...c, color: 'amber', sent: false });
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
    const puzzleKey = this.state.puzzleId + ':' + this.state.gridLetters;
    const valid = () => puzzleKey === this.state.puzzleId + ':' + this.state.gridLetters;
    const c = classify(text, { ctrl, ...options });
    if (c.kind === 'none') return { kind: 'none' };
    if (c.kind === 'blocked') return { ...c, color: 'amber', sent: false };

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
    if (this.state.puzzleMatch === true) {
      try { code = await this.pages.clues.addBabbleWord(w); }
      catch { /* Babble can still accept words while Clues is unavailable */ }
    }
    code = code == null ? '' : String(code).trim();
    try { await this.pages.clues.showAll(); } catch { /* ignore */ }
    let outcome = 'unconfirmed';
    if (w.length < 4) {
      if (this.state.ready && this.pages.babble.setWordEntry) {
        try { await this.pages.babble.setWordEntry(w); } catch { /* Keep the explicit short-word result. */ }
      }
      outcome = 'rejected';
    }
    else if (this.state.ready) {
      try { outcome = await this.addToBabble(w, valid); } catch { /* retain unconfirmed */ }
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
