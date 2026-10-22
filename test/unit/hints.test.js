'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path'), { pathToFileURL } = require('node:url');
const { rememberLocalWindow } = require('../../src/local-window');
const { createHints } = require('../../src/hints');

class Window extends EventEmitter {
  constructor() {
    super(); this.dead = false;
    this.contents = Object.assign(new EventEmitter(), { dead: false, mainFrame: {}, sent: [],
      isDestroyed() { return this.dead; }, send(channel) { if (this.dead) throw Error('send after teardown'); this.sent.push(channel); },
      getURL: () => pathToFileURL(path.resolve('src/ui/index.html')).href, setWindowOpenHandler() {} });
  }
  get webContents() { return this.contents; }
  isDestroyed() { return this.dead; }
  isFocused() { return true; }
  isVisible() { return true; }
  getBounds() { return { x: 0, y: 0, width: 800, height: 600 }; }
  getContentBounds() { return this.getBounds(); }
  hide() {} setIgnoreMouseEvents() {}
  loadFile() { return new Promise(() => {}); }
  destroy() { this.dead = true; this.emit('closed'); }
}
function fixture() {
  const parent = new Window(), add = new Window(), ipcMain = new EventEmitter();
  for (const win of [parent, add]) rememberLocalWindow(win, path.resolve('src/ui/index.html'));
  const hints = createHints({ BrowserWindow: Window, ipcMain, parent, getOwners: () => [parent, add], enabled: () => true,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1000, height: 800 } }) } });
  const request = win => ipcMain.emit('hint', { sender: win.webContents, senderFrame: win.webContents.mainFrame }, { text: 'Test hint', rect: { x: 10, y: 10, width: 60, height: 20 } });
  return { parent, add, ipcMain, hints, request };
}
test('hint dismissal tolerates a null window webContents before the window is marked destroyed', () => {
  const { parent, hints, request, ipcMain } = fixture();
  request(parent); const contents = parent.webContents;
  contents.dead = true; parent.contents = null;
  assert.equal(parent.isDestroyed(), false); // The observed Electron teardown order.
  assert.doesNotThrow(() => parent.emit('blur'));
  assert.doesNotThrow(() => hints.hide());
  assert.doesNotThrow(() => { contents.emit('destroyed'); parent.emit('closed'); });
  assert.equal(ipcMain.listenerCount('hint'), 0);
  assert.equal(hints.getWindow(), null);
  assert.deepEqual(contents.sent, []);
});
test('closing Add clears its hint owner and later hints can belong to the main window', () => {
  const { parent, add, hints, request } = fixture();
  request(add); const contents = add.webContents;
  contents.dead = true; add.contents = null;
  assert.doesNotThrow(() => { contents.emit('destroyed'); add.emit('closed'); add.emit('hide'); });
  request(parent); hints.hide();
  assert.deepEqual(contents.sent, []);
  assert.deepEqual(parent.webContents.sent, ['hint-dismiss']);
  parent.emit('closed');
});
