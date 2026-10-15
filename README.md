# Babble Expert (desktop)

Babble and either Lickety's Clues or Self Serve Clues side by side, with one-click sending of words in both directions,
plus the floating **Lickety Add** box. Windows and Mac. This is the Electron version of the Delphi app.

## Run it in VS Code
1. Install Node.js 22 or newer.
2. Open this folder in VS Code, then in the terminal: `npm install` and `npm start`.
3. Press **F5** to run with the debugger (opens DevTools for the toolbar window).

## How it works (why there is nothing extra to install)
Each page is a real browser view inside the window. The app runs JavaScript in the page, exactly like the
Delphi `CallJavascript` did:

| Button / action | What it runs |
|---|---|
| `<- Send Words to Clues` | reads `#word_list td.word` on Babble, then `AddBabbleWord(word)` for each, then `showAll()` on Clues |
| `Send Words to Babble ->` | `GetAllWords()` on Clues, then `AddWord(word)` on Babble for each word not already in the grid |
| Lickety Add, Enter | word: `AddBabbleWord` + `showAll`, then `AddWord` if 4+ letters and not already there. Text: Babble chat form + `AddChatMessage()` |

Use the **Clues** selector in the toolbar to switch between Lickety's original clues and Self Serve Clues. The choice is remembered. Both clue pages support the transfer buttons and Lickety Add.

Scripts only run when a view is on `playbabble.com`, `r46.me`, or `selfserve.r46.me` (see `src/pages.js`), and only the three Clues
functions can be called. Both clue sources are loaded from their live sites, so new puzzles need no Babble Expert release.

## Change things
- **URLs / allowed sites:** `DEFAULTS` at the top of `src/app.js`.
- **Resources menu:** `src/resources.js` (the removed entries are listed in its header comment).
- **Settings file:** `settings.json` in the app-data folder (Windows `%APPDATA%\babble-expert`, Mac `~/Library/Application Support/babble-expert`).
- **Secret Cheat Clues entry:** start the app with `code=MrPIsALittleCheater;GoHome`.

## Tests
- `npm test`: unit tests for the send/Add-box logic, the page scripting guard and settings (no window needed).
- `npm run test:e2e`: launches the real app against local fake Babble and Clues pages and clicks the real buttons.
  On Linux/CI wrap it in `xvfb-run -a`.
- `REAL_CLUES=path/to/babbleclues.html npm run test:real-clues`: the same against your real Clues page.

## Build installers
- Windows (on Windows): `npm run dist:win` gives `dist/BabbleExpert-Windows-Setup.exe` and `dist/BabbleExpert-Windows-Portable.exe`.
- Mac (on a Mac): `npm run dist:mac` gives `dist/BabbleExpert-macOS.dmg` (Intel and Apple Silicon in one).
- No Mac? Push to GitHub, then tag a version (`git tag v1.0.0 && git push --tags`) or run the **Build installers**
  workflow by hand. `.github/workflows/build.yml` builds both and attaches them to a GitHub Release.
- Bump `version` in `package.json` for each release.

## First-run warnings (unsigned builds)
- **Windows:** SmartScreen says "Windows protected your PC": click **More info**, then **Run anyway**.
- **Mac:** double-click is blocked: right-click the app, choose **Open**, then **Open** again. (Or System Settings,
  Privacy and Security, "Open Anyway".)
- Removing these needs code signing: a Windows certificate, and for Mac an Apple Developer account (US$99/year)
  with notarization. electron-builder supports both once you have the certificates.
