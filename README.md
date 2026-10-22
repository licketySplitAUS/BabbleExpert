# Babble Expert (desktop)

**Guided tour:** Help and Options both open **A day in Babble Expert**, a captioned walkthrough recorded from the real app in its own window. It opens only when you choose it; login, startup and upgrades never launch the tour automatically. The window appears immediately without maximizing, fits the available display and reuses the same window on repeat clicks. Failed loading, a renderer crash or a 60-second loading timeout closes only the tour and returns you to Expert. Choose chapters, scrub, pause, change speed or use Less motion. It covers word entry, grid clicking, both clue sources, resources, chat, layout, Fun Word Play, Chill Vibes and Create Clues. The 6:46 offline recording never touches the live puzzle or chat. Chapter selection always starts playback. Its portable footage, captions and player are documented in [src/tour/README.md](src/tour/README.md).

Babble and either Lickety's Clues or Self Serve Clues side by side, with automatic sharing of new words in both directions,
plus the floating **Lickety Add** box. Windows and Mac. This is the Electron version of the Delphi app.

## License

Babble Expert's own code and assets are available under the [MIT License](LICENSE).
Third-party dependencies retain their respective licenses. PlayBabble, the clue
websites and other externally loaded content are separate services; this license
does not grant rights to their content.

## Project policies

See [Security reporting](SECURITY.md), [Privacy information](PRIVACY.md) and
[Code signing policy](CODE_SIGNING.md). Current releases remain unsigned;
the maintainer has chosen to continue unsigned distribution.

As a word is typed in Lickety Add (or PlayBabble's own word field), an animated colour-shifting path traces it across the live grid. Duplicate letters are resolved against legal connected paths and, when available, the words still unfound on the selected Clues page. Submitting releases the path in the same green, amber, or red result colour as Lickety Add. The enhancement is injected only on the exact PlayBabble hosts.

**Highlight entry on grid** is on by default and can be switched off in Options. **Options → Zoom** adjusts all three panes from 75% to 200% and remembers the level after restarting. Its menu stays open for repeated adjustments; click back on a page or press Escape to dismiss it. Drag the dotted dividers to resize panes; resource lists remain within the available window space. **Fun Word Play** and **Chill Vibes** open local desktop animations in the right pane and respond to typing and submitted words. Lickety Info opens a packaged page about licketySplitAUS and links to other experiments.

Finishing the grid starts a 60-second fireworks display in the right pane and transparent, click-through overlays on Clues and PlayBabble. The right pane supplies the sound; click it to replay, or use **Hide** to dismiss the whole celebration. For local preview, open `src/experiments/fireworks.html`. In the app, five clicks within one second on the Lickety heart logo (`MyLogo.gif` or its JPG variant) start the same celebration without changing the puzzle.

In the word lists, typing centres the matching word and briefly pauses mouse-hover scrolling. Move the mouse deliberately after the pause to resume scrolling. Hover scrolling is gentle, uses small edge zones, and waits 300 ms before moving; the strip below the search box stays still so you can reach the toolbar. Normal wheel and middle-button scrolling remain available. The **− / +** buttons beside **Hide** switch between 4–12 letter lists, using the last word you clicked to centre the closest starting-letter match in the next list. Before you click a word, the middle word is used instead. With a word list open, clicking an unfinished clue entry on either clue page switches to its word length and centres the first word matching its starting letters between the nearest solved clues.

**Options → Create Clues - click on your found word** is on by default. Click any completed word’s row in Babble’s **My Word List**, or a found word’s row in either clue page, to open an editable definition clue with its starting letters, length and Babble score. Found/unfound checkboxes keep their normal action. **Try again** selects another available definition, or retries the lookup when only one or none is available. **Send to Babble Chat** explicitly submits the clue; Close or Esc dismisses it. Definitions come from the [Datamuse API](https://www.datamuse.com/api/); each lookup sends the clicked word to Datamuse. The app caches definitions for the session and never fetches the whole completed list. Datamuse has announced that API keys will be required from February 2027; this integration currently uses its public endpoint.

Usage notifications are opt-in and can be disabled in Options. They report installs/upgrades, Resources and Options menu choices, time the app was open, the app version, OS, approximate country and a random installation ID. After accepting the updated consent, reports can also include an approximate city based on the network connection. The ID persists in app settings across upgrades and does not use a username, IP address or hardware fingerprint. Entered words and chat are never sent. The Discord webhook secret stays on the Netlify server, not in the app.

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

Compact status stays in the existing toolbar. Bulk transfer and automatic Grab Grid use the 25 grid letters in tile order, never the Clues puzzle number. Failed or unresponsive panes offer retry and browser actions.

**Options → Browser tools** provides separate menus for Babble, Clues and an open Resources pane: Return, Back/Forward, reload the current page, reload ignoring cache, clear cached files while keeping login cookies, reset the current site's login and data, and page/session information. Normal Clues reloads preserve checked words when the grid is unchanged. A site-data reset requires confirmation and can remove locally saved clue progress. Babble and Clues share a browser session, so clearing cached files from either clears that session's HTTP cache; Resources uses a separate session. Expert's cookies are separate from your normal browser, and Expert does not save passwords. Website session expiry still applies. Babble links, including the return link from Iron Sudoku, use `https://playbabble.com` in the Babble pane to avoid losing a host-specific login when a link uses `www.playbabble.com`.

The accepted word lists are automatically reconciled, normally within a second, while both grids match. This includes saved clue words, words missing after a reconnect, and importing Babble's existing words when switching clue sources. Temporary Babble failures are retried after five seconds without blocking other words; explicit rejections are reported without repeatedly resubmitting the same word. The transfer buttons remain available for a manual sync. Typing or pasting into word entries (including individual clue answers) highlights the path on Babble. Click adjacent Babble tiles to build a word in its entry box, then use Enter or Add to submit it; a Qu tile enters both letters. Clicking the last selected tile again removes it, including both letters for Qu; the same undo works on both clues grids. A click that cannot continue the previous path starts a fresh word. Resource, clue and Lickety Add submissions populate Babble's own entry box, and the next grid click starts cleanly. Tile entry also works when highlighting is switched off.

**Help** in the toolbar (or **F1** from the main window, Babble, Clues, Resources or Lickety Add) opens an optional, offline three-step guide covering clue sources, word entry and colours, and word transfer. A **Keyboard shortcuts** tab lists the supported keys. Help never opens automatically and does not alter the puzzle layout; **Esc** closes it.

Lickety Add processes submissions in order. Green means Babble confirmed an addition, amber means a duplicate or an uncertain/Clues-only result, and red means an explicit rejection; a text explanation uses the existing Add header. The last 50 submissions are retained in memory for the current app session, accessible through the compact **Entries…** toolbar button in a separate dialog. No session list or restore controls use space in the puzzle panes or Add box. Chat is never retried automatically, and history is not included in usage notifications.

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
- **Help → Release notes** displays the packaged `RELEASE_NOTES.md` offline and recent published GitHub releases when connected. Before replacing the current notes for a release, archive them in `src/release-history.json`. The update bar's **What's new** button opens the same in-app tab.

## Updates

### Startup troubleshooting

Expert shows its main window immediately while the local interface loads. Opening it again, including rapidly double-clicking its shortcut, brings the existing window forward and restores it if minimized. It does not create another game window or reload the puzzle.

If the local interface fails to load, crashes, or has not finished loading after 60 seconds, Expert shows an error and exits after that message is dismissed, allowing a fresh launch. This deadline applies to the local interface, not the online Babble or Clues pages. It does not automatically restart or reinstall the app.

Local diagnostics are saved in `startup.log` in Electron's user-data folder (normally `%APPDATA%\babble-expert` on Windows); the error message shows the exact path. One previous log is kept as `startup.log.previous`, with rotation above 128 KiB. These files record startup, activation and window-failure information, are not uploaded automatically, and do not record puzzle words or launch arguments.

With anonymous sharing enabled, restricted diagnostic reports are sent through `/api/expert-diagnostics` to the maintainer's dedicated Discord channel. Reports cover startup failures, main-interface loading over 10 seconds, online page loading over 30 seconds, loading failures, renderer crashes, unresponsive/recovered pages and update failures (check/download/install handoff). They include the installation alias, app version, OS build, architecture, total RAM, component, error codes and timings, without raw messages, stacks, paths, URLs or page contents. Repeated incidents are counted, critical failures take priority, and at most 20 reports are queued for up to seven days if delivery fails. Turning sharing off clears that queue. Development and tour-recording runs do not send diagnostics.

The server requires the Functions environment variable `DISCORD_DIAGNOSTICS_WEBHOOK_URL` and a redeploy after setting it. The webhook is never included in the app or static website. Failures before the app can execute (Windows blocking Setup, a broken installer, power loss, or a total main-process crash) cannot reliably be reported by this mechanism. Update failures are captured where the updater exposes an error; installer subprocess failures after a successful handoff may not be visible.

To test the real single-instance lock and hidden/minimized window recovery, run `node test/e2e/run.js startup-main.js --no-sandbox` (use `xvfb-run -a` on Linux/CI).

### Installing updates

- The installed Windows edition checks GitHub Releases at startup and every 30 minutes while running (also when returning to the app if a check is overdue). It downloads a newer release quietly, then offers **Update now** to install and reopen Expert, or **Later** to keep playing and install when Expert closes. Each downloaded version prompts only once per session.
- Update buttons appear only when a newer release is available. After choosing Later, **Install and restart** stays available in the toolbar. **What's new** appears alongside an available update; manual checking is under **Options → Check for updates**. Manual checks show progress, the installed version when up to date, or an error in the existing top bar; the result clears after 15 seconds. Routine background checks remain quiet when there is no update.
- **Update now / Install and restart** saves settings, closes Expert, shows installer progress and reopens Expert automatically. Wait for it to reopen rather than using the shortcut. **Later** installs silently when Expert closes, without reopening; allow installation to finish before launching again. The desktop shortcut remains throughout. **Help → Updates** explains these steps.
- A local last-run version, independent of usage-sharing consent, allows the first launch after an upgrade to confirm the new running version for 20 seconds. Older installations with no recorded version show a neutral running-version notice on their first launch instead. This local marker is not added to usage reports.
- The unsigned Mac edition checks on the same schedule and, when a newer release exists, offers a direct **Download DMG** button with replacement instructions, once per version per session.
- Development runs never check for updates. Update failures are non-blocking and do not interrupt play.
- Existing users need to install this updater-aware release once; subsequent Windows releases update in place.

## First-run warnings (unsigned builds)
- **Windows:** SmartScreen says "Windows protected your PC": click **More info**, then **Run anyway**.
- **Mac:** double-click is blocked: right-click the app, choose **Open**, then **Open** again. (Or System Settings,
  Privacy and Security, "Open Anyway".)
- Removing these needs code signing: a Windows certificate, and for Mac an Apple Developer account (US$99/year)
  with notarization. electron-builder supports both once you have the certificates.

With anonymous sharing enabled, one startup notification per running app goes to the dedicated startup channel using the existing installation alias. Repeated shortcut clicks do not send additional startup notices.
