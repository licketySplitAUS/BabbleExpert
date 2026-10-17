# Babble Expert (desktop)

Babble and either Lickety's Clues or Self Serve Clues side by side, with one-click sending of words in both directions,
plus the floating **Lickety Add** box. Windows and Mac. This is the Electron version of the Delphi app.

As a word is typed in Lickety Add (or PlayBabble's own word field), an animated colour-shifting path traces it across the live grid. Duplicate letters are resolved against legal connected paths and, when available, the words still unfound on the selected Clues page. Submitting releases the path in the same green, amber, or red result colour as Lickety Add. The enhancement is injected only on the exact PlayBabble hosts.

**Highlight entry on grid** is on by default and can be switched off in Options. **Fun Word Play** and **Chill Vibes** open local desktop animations in the right pane and respond to typing and submitted words. Lickety Info opens a packaged page about licketySplitAUS and links to other experiments.

Finishing the grid starts a 60-second fireworks display in the right pane and transparent, click-through overlays on Clues and PlayBabble. The right pane supplies the sound; click it to replay, or use **Hide** to dismiss the whole celebration. For local preview, open `src/experiments/fireworks.html`. In the app, five clicks within one second on the Lickety heart logo (`MyLogo.gif` or its JPG variant) start the same celebration without changing the puzzle.

Usage notifications are opt-in and can be disabled in Options. They report installs/upgrades, Resources and Options menu choices, time the app was open, the app version, OS, approximate country and a random installation ID. The ID persists in app settings across upgrades and does not use a username, IP address or hardware fingerprint. Entered words and chat are never sent. The Discord webhook secret stays on the Netlify server, not in the app.

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
- `node test/e2e/run.js fireworks-main.js --no-sandbox`: checks real fireworks rendering/audio and transparent overlays, including mouse clicks passing through to the original page.
- `REAL_CLUES=path/to/babbleclues.html npm run test:real-clues`: the same against your real Clues page.

## Build installers
- Windows (on Windows): `npm run dist:win` gives `dist/BabbleExpert-Windows-Setup.exe`.
- Mac (on a Mac): `npm run dist:mac` gives `dist/BabbleExpert-macOS.dmg` (Intel and Apple Silicon in one).
- No Mac? Push to GitHub, then tag a version (`git tag v1.0.0 && git push --tags`) or run the **Build installers**
  workflow by hand. `.github/workflows/build.yml` builds both and attaches them to a GitHub Release.
- Bump `version` in `package.json` for each release.
- Also update `build.buildVersion`, the root versions in `package-lock.json`, and `RELEASE_NOTES.md` before tagging. Release notes are attached by the workflow.

## Updates
- The installed Windows edition checks GitHub Releases once at startup, downloads a newer release quietly, and installs it when Babble Expert closes. The next launch uses the new version.
- The unsigned Mac edition checks once at startup and, when a newer release exists, offers a direct **Download DMG** button with replacement instructions.
- Development runs never check for updates. Update failures are non-blocking and do not interrupt play.
- Existing users need to install this updater-aware release once; subsequent Windows releases update in place.

## First-run warnings (unsigned builds)
- **Windows:** SmartScreen says "Windows protected your PC": click **More info**, then **Run anyway**.
- **Mac:** double-click is blocked: right-click the app, choose **Open**, then **Open** again. (Or System Settings,
  Privacy and Security, "Open Anyway".)
- Removing these needs code signing: a Windows certificate, and for Mac an Apple Developer account (US$99/year)
  with notarization. electron-builder supports both once you have the certificates.
