# Babble Expert (desktop)

**Developers:** start with the [documentation index](docs/README.md) for desktop architecture, logic flows, shared design principles and build/release pipelines.

**Guided tour:** temporarily removed from Help, Options and release packages in V3.5.0.0 while it is reworked. The player and recordings remain in [src/tour](src/tour/README.md) for development; installers exclude them. The written Help guide remains available.

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

Usage notifications are opt-in and can be disabled in Options. With sharing enabled, each actual Expert fireworks start (automatic completion or manual preview) and replay sends one notification through the fireworks channel. Embedded Clues defers its own celebration/report to Expert; no puzzle identifier, found-word list or completion count is sent. They report installs/upgrades, Resources and Options menu choices, time the app was open, the app version, OS, approximate country and a random installation ID. After accepting the updated consent, reports can also include an approximate city based on the network connection. The ID persists in app settings across upgrades and does not use a username, IP address or hardware fingerprint. The optional checkbox on Send lickety a message can separately link a user-entered Babble username to the installation for future reports; it starts off, does not enable usage sharing, and can be removed on that page. Contact names and email addresses are separate. Entered words and chat are never sent. The Discord webhook secret stays on the Netlify server, not in the app.

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
| Lickety Add, Enter | word: `AddBabbleWord` + `showAll`, then `AddWord` if 4+ letters and not already there. Normal messages go to chat with Enter; suspected word lists require Ctrl+Enter (Mac: ⌘+Enter). Multiline entries and text over 500 characters are blocked |

Use the **Clues** selector in the toolbar to switch between Lickety's original clues and Self Serve Clues. The choice is remembered. Both clue pages support the transfer buttons and Lickety Add.

Compact status stays in the existing toolbar. Bulk transfer and automatic Grab Grid use the 25 grid letters in tile order, never the Clues puzzle number. Failed or unresponsive panes offer retry and browser actions.

**Options → Browser tools** provides separate menus for Babble, Clues and an open Resources pane: Return, Back/Forward, reload the current page, reload ignoring cache, clear cached files while keeping login cookies, reset the current site's login and data, and page/session information. Normal Clues reloads preserve checked words when the grid is unchanged. A site-data reset requires confirmation and can remove locally saved clue progress. Babble and Clues share a browser session, so clearing cached files from either clears that session's HTTP cache; Resources uses a separate session. Expert's cookies are separate from your normal browser, and Expert does not save passwords. Website session expiry still applies. Babble links, including the return link from Iron Sudoku, use `https://playbabble.com` in the Babble pane to avoid losing a host-specific login when a link uses `www.playbabble.com`.

The accepted word lists are automatically reconciled, normally within a second, while both grids match. This includes saved clue words, words missing after a reconnect, and importing Babble's existing words when switching clue sources. Temporary Babble failures are retried after five seconds without blocking other words; explicit rejections are reported without repeatedly resubmitting the same word. The transfer buttons remain available for a manual sync. Typing or pasting into word entries (including individual clue answers) highlights the path on Babble. Click adjacent Babble tiles to build a word in its entry box, then use Enter or Add to submit it; a Qu tile enters both letters. Clicking the last selected tile again removes it, including both letters for Qu; the same undo works on both clues grids. A click that cannot continue the previous path starts a fresh word. Resource, clue and Lickety Add submissions populate Babble's own entry box, and the next grid click starts cleanly. Tile entry also works when highlighting is switched off.

**Help** in the toolbar (or **F1** from the main window, Babble, Clues, Resources or Lickety Add) opens an optional, offline three-step guide covering clue sources, word entry and colours, and word transfer. A **Keyboard shortcuts** tab lists the supported keys. Help never opens automatically and does not alter the puzzle layout; **Esc** closes it.

Lickety Add processes submissions in order. Green means Babble confirmed an addition, amber means a duplicate or an uncertain/Clues-only result, and red means an explicit rejection; a text explanation uses the existing Add header. The last 50 submissions are retained in memory for the current app session, accessible through the compact **Entries…** toolbar button in a separate dialog. No session list or restore controls use space in the puzzle panes or Add box. Chat is never retried automatically, and history is not included in usage notifications.

Scripts only run when a view is on `playbabble.com`, `r46.me`, or `selfserve.r46.me` (see `src/pages.js`), and only the three Clues
functions can be called. Both clue sources are loaded from their live sites, so new puzzles need no Babble Expert release.

## Change things

**Resource lists** use an app-bundled viewer that keeps only visible rows and a small buffer in the page. The existing hosted 4–12 letter lists remain compatible with older Expert releases. Validated lists are saved on this device; reopening a saved list is immediate, and lists older than a day refresh in the background for their next opening. **Reload current page ignoring cache** requests fresh word data. Browser **Clear cached files** clears HTTP cache, while these validated dictionary copies are separate files in the app-data `word-lists` folder.

**Options → Resources on the left** moves the Resources pane to the far left and remembers the preference. New profiles default to the left; saved choices are preserved. **Switch Sides (Clues and Babble)** still swaps those two panes independently. Moving Resources preserves its current page, word position and colours. Drag its resize bar or use Left/Right on the bar; Home makes the pane narrower. The preference also applies when you next open Resources.

Resources marks possible reference-dice conflicts with a light gray background, using the same Big Boggle dice model described on Lickety Info. Hover for the reason. These hints do not assert Babble impossibility; words remain clickable and word-result colours take priority. Only displayed rows are classified, with a bounded cache and no additional network requests.

With Clues set to **Off** and a word list open in Resources, completing the selected clue automatically moves both panes to the next unfinished clue, switching word length when needed. Select a clue by clicking its entry or using **N/P** or right-click navigation. Finding a different clue does not skip the selected unfinished one. Automatic movement stops when no unfinished 4–12-letter clues remain.

**Options → Personal progress journal…** opens an optional record of your puzzles, found counts by word length, up to five longest words, observed completion and recorded active time. Recording is on by default, so your history builds up as you play. The next update enables recording once for existing installations too, including saved off settings; any later pause is remembered. It pauses outside the main Expert/Lickety Add windows, while minimised, locked, asleep, disconnected, or after five minutes without device input. Puzzles started before tracking or changed while paused are marked partly tracked. Turning recording off preserves history; the journal provides CSV export and confirmed deletion. Up to 2,000 puzzle summaries are kept in `progress-journal.json` on this device. Journal records are never sent to Discord or Netlify. If anonymous usage sharing is on, moving Resources left or enabling journal recording sends one option-use notice to the existing general Discord channel for each actual off-to-on change. Restoring saved preferences, opening the journal and switching these options off do not send these notices. Recording progress itself makes no network requests.

- **URLs / allowed sites:** `DEFAULTS` at the top of `src/app.js`.
- **Resources menu:** `src/resources.js` (the removed entries are listed in its header comment).
- **Settings file:** `settings.json` in the app-data folder (Windows `%APPDATA%\babble-expert`, Mac `~/Library/Application Support/babble-expert`).
- **Secret Cheat Clues entry:** start the app with `code=MrPIsALittleCheater;GoHome`.

## Tests
- `npm test`: unit tests for the send/Add-box logic, the page scripting guard and settings (no window needed).
- `npm run test:e2e`: launches the real app against local fake Babble and Clues pages and clicks the real buttons.
  On Linux/CI wrap it in `xvfb-run -a`.
- `node test/e2e/run.js fireworks-main.js --no-sandbox`: checks real fireworks rendering/audio and transparent overlays, including mouse clicks passing through to the original page.
- `node test/e2e/run.js resource-loading-main.js --no-sandbox`: checks centred word-list progress, reduced motion, positioning before slow assets finish, failure recovery and Hide. Set `WORD_LIST_DIR` to the Babble repository containing `words-4.html` through `words-12.html`.
- `node test/e2e/run.js next-clue-main.js --no-sandbox`: checks N/P and right-click navigation in Clues and word lists, completed-row skipping, wrap in both directions, normal editing and Self Serve Off-style row removal. Uses the same `WORD_LIST_DIR`.
- `node test/e2e/run.js auto-next-clue-main.js --no-sandbox`: checks automatic movement of both panes in Off mode, length switching, duplicate/rejected/unrelated words, All mode and completion with local fixtures.
- `node test/e2e/run.js resource-performance-main.js --no-sandbox`: measures large-list parsing, visible-row bounds, result restoration and resize layout; validates every unchanged hosted word list. Uses the same `WORD_LIST_DIR`.
- `node test/e2e/run.js progress-journal-main.js --no-sandbox`: checks the optional journal with unavailable Clues, local persistence and timing, CSV export, confirmed deletion, trusted-window access, telemetry separation and narrow-window layout. Uses temporary profiles and local fixtures.
- `node test/e2e/update-highlights-run.js`: uses eight real app launches with an isolated profile to check first install, update detection, offline highlights, closing without OK, acknowledgement, development preview, later restarts, downgrade and a subsequent update.
- `REAL_CLUES=path/to/babbleclues.html npm run test:real-clues`: the same against your real Clues page.

## Build installers

Before each release, curate `src/update-highlights.json` with a short list of changes players will notice, including where to find new options. Keep technical, reporting and admin details in the full release notes instead. The packaged app shows these highlights automatically after an identified upgrade, independently of usage sharing and internet access. **OK** saves acknowledgement for that version on this device; closing without OK keeps it pending for the next launch. First installs and development runs do not auto-open it. **Options → What’s new** opens the current highlights manually; in development it is labelled a preview of the next update. **Full release notes** opens the existing Help tab. Continue to update `RELEASE_NOTES.md` and the version metadata for the eventual release; a source change does not publish an update.

- Windows (on Windows): `npm run dist:win` gives `dist/BabbleExpert-Windows-Setup.exe`.
- Mac (on a Mac): `npm run dist:mac` gives `dist/BabbleExpert-macOS.dmg` (Intel and Apple Silicon in one).
- No Mac? Push to GitHub, then tag the release version. `.github/workflows/build.yml` tests the source, builds both installers, verifies manifests/checksums and runs packaged installation checks. Tag builds attach the files to a **draft** GitHub Release. Verify both platforms and all updater assets before publishing that draft as the latest release. A manual workflow run builds artifacts without creating a release.
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

### Helpful hints

Hover over an Expert toolbar, resize bar or Lickety Add control for one second to see a readable caption. Keyboard focus also shows hints. Click, type or press Escape to dismiss them. **Options → Show helpful hints** controls them; hints turn off after the first exit following V3.5.0.0. A later manual choice to re-enable them is remembered. **Larger toolbar and controls** also enlarges captions. Click a resize bar to focus it, then use Left/Right, Shift for larger steps or Home for minimum width.
