# Expert implementation reference for agents

Paths below are relative to the repository root. Read the section relevant to a change; this is not a prerequisite for every edit. Based on source reviewed on 29 October 2026. Existing implementation and tests establish current behaviour; dated plans and transcripts explain decisions but may describe superseded versions.

## Page adapters, synchronization and recovery

- `src/engine.js` is independent of Electron. Keep orchestration and entry classification testable there; `src/pages.js` adapts external page APIs/DOM; `src/app.js` wires windows, events and services.
- Transfers require ready pages and matching 25-letter grids. The original clues puzzle number is unreliable. Include grid identity and page revisions in asynchronous guards; source switches, navigation and a puzzle flip invalidate old work.
- Babble loads saved words asynchronously after the document loads. Preserve `babbleWordListReady`; an initially empty list must not cause every clue word to be replayed. All submission paths share queues. Preserve pacing, duplicate checks and single-flight polling.
- Accepted words are reconciled both ways, including on clue-source changes. A stale display is repaired from Babble's saved word-list endpoint without a page refresh or losing a chat draft. An acknowledgement alone does not prove that displayed words updated.
- Green means confirmed accepted; amber covers duplicates, uncertain delivery and Clues-only results; red requires explicit rejection. Do not classify stale clues or a timeout as an invalid word.
- Legacy bridge calls use `AddBabbleWord`, `GetAllWords` and `showAll`; return values are normalized to strings. Self Serve's reactive refresh must preserve All/On/Off. Older clients still call its compatibility `showAll()`.
- PlayBabble uses Prototype, which overrides `Array.from` and ignores its mapping callback. Injected scripts should use existing compatible DOM-reading patterns such as `Array.prototype.map.call`. Exercise the Prototype regression when changing snapshots.
- `src/page-runtime.js` validates hosts and bounds page calls; calls reject on navigation, crash, destruction or deadline. A timeout does not prove a submission failed or cancel arbitrary JavaScript already running in a page. Check identity/state before further effects; do not blindly replay chat or word submissions.
- `src/page-recovery.js` retries only transient failures of known GET navigations opened by Expert. It does not auto-reload a merely slow/frozen page or replay forms/redirects. Preserve bounded recovery and diagnostics rather than adding generic reload loops.

## Window trust, sessions and layout

- Keep sandboxing/context isolation enabled and Node integration off. Use `src/local-window.js` for local auxiliary-window loading and `trustedLocal` checks: expected webContents, top frame and exact packaged document. Remote-page IPC separately checks the expected pane, top frame and permitted host. A channel name or matching host alone is insufficient.
- `src/preload-*.js` exposes only named feature operations. Remote pages must not receive unrestricted IPC, shell or filesystem access. Validate main-process payloads even when the preload already validates them.
- Babble and Clues share `persist:babble`; Resources uses `persist:resources`. These sessions are separate from the user's normal browser. Preserve HTTPS/non-www Babble canonicalization and cross-game return navigation. Clearing HTTP cache keeps login cookies; site-data reset is destructive and confirmed.
- Native `WebContentsView` surfaces sit above renderer HTML. Preserve layout rectangles, view visibility and zoom after navigation; an HTML loading overlay alone cannot cover a visible native view. Exercise hidden clues, swapped sides, Resources left/right, resizing and non-default zoom when changing layout.
- Single-instance locking/activation belongs in `src/main.js` and `src/startup.js`. Show/focus the main window without relying only on first paint. Auxiliary dialogs should restore the intended parent/focus when closing, not leave the application behind another program.

## Two generations of word-list resources

- `src/resources.js` defines resources. The word-list sources remain `https://licketysplitaus.github.io/Babble/words-N.html`, separate from the Netlify `r46.me` site.
- Current Expert loads `src/ui/word-list.html` and its virtualized viewer. `src/word-list-data.js` fetches hosted HTML as text, extracts `<div class="w">word</div>` data, and validates sorted, unique, lowercase words of the exact requested length. It never executes those hosted scripts.
- Keep strict source-host/path checks, bounded responses and cache validation. Saved lists display immediately; stale lists refresh in the background without replacing words under the pointer. Failed refresh retains good cached data. Arbitrary redirects/sources are not allowed.
- `src/word-list-index.js` supplies pure binary-search/range maths. Render only visible rows plus a buffer; recycle rows without retaining another word's colour, tooltip or pending state. Performance tests assert bounded DOM, not a machine-specific millisecond threshold.
- `src/word-list.js` retains sparse results by puzzle/length. Reset on puzzle change, not on list-size changes. Restore results from the accepted list already read by sync rather than issuing another full DOM scan.
- Resource loads/lookups carry navigation/generation guards. Hide, source changes and newer clue clicks must invalidate stale results. Preserve keyboard priority over hover scrolling, last-clicked anchors for +/- lengths, and N/P/right-click clue navigation without stealing text-entry keystrokes.
- Older released Expert versions still execute hosted list scripts. Changes in Babble's generator must preserve their click/copy/hash protocol as well as the current text parser. Changing current packaged viewer behaviour usually needs no hosted-page change.
- Dice-conflict colouring is advisory. The reference Big Boggle dice are not verified Babble generator rules; never disable words or exclude them from the dictionary based on this classification.

## Local state, reporting and releases

- Settings validation/migration is in `src/settings.js`. Resources starts left; the journal has a one-time default-on migration; hints turn off after the first session. Later user choices persist. The guided tour remains in source but is excluded from packages and menus while reworked.
- `src/progress-journal.js` records local summaries from one atomic Babble snapshot independently of Clues. Preserve partial-tracking labels and monotonic active-time accounting; exclude idle/background, sleep, lock, disconnected and between-launch time. A corrupted journal is preserved and recording blocked until explicit clear; do not silently overwrite it. Save atomically and flush for suspend, shutdown and updates.
- Usage reporting and diagnostics require saved consent. Diagnostics have allowlisted fields, a bounded/expiring queue and deduplication. Do not forward raw exception messages, stacks, page contents, URLs or local paths. `startup.log` is local-only and can contain details that remote reports must exclude.
- Username linking is separate, optional and initially unticked; it never enables usage sharing. Old queued diagnostics must not gain a username link granted after the event. Journal records never enter reports. Explicit contact messages and Datamuse definition lookups are separate user actions, not anonymous usage events.
- Expert owns embedded fireworks/reporting, while standalone clues celebrate independently. Only the first word-list resource per session is reported. Automatic checks/restored preferences must not become artificial user actions.
- `src/updates.js` uses Windows updater install/restart and a macOS DMG download/replacement flow. Do not promise unsigned macOS in-place updates. Before install, wait for engine work and flush state. Manual checks need feedback; avoid duplicate failure reports from updater events plus promise rejection.
- Keep three-part package/tag versions and four-part display/build versions consistent. Maintain `RELEASE_NOTES.md`, `src/release-history.json` and `src/update-highlights.json` for a requested release. Highlights acknowledge only on explicit OK, separately from the last-run marker.
- `.github/workflows/build.yml` tests, builds Windows/macOS, verifies hashes/manifests/blockmaps and creates a **draft** tag release with `make_latest: false`. A successful workflow is not proof of a published latest release. After authorized publication, verify both installer assets and automatic-update metadata. Windows checks do not establish native macOS success.

## Focused verification map

For a meaningful bug fix, reproduce the reported failure with the smallest suitable existing fixture/test where practical, then verify the correction. Prefer observable state/events and injectable clocks to fixed delays. Keep assertions about player behaviour or durable contracts; do not expand the test matrix merely to mirror implementation branches. A failing check must be explained or fixed, not hidden by weakening expectations.

Unit files live in `test/unit/`; Electron files in `test/e2e/`. Use the existing `run.js` wrapper for ordinary E2E files; update highlights has `test/e2e/update-highlights-run.js`. Resource fixtures may require `WORD_LIST_DIR` from the Babble checkout.

| Change | Start with these checks |
| --- | --- |
| Transfers, entry results, saved-list recovery | `engine.test.js`, `pages.test.js`; `e2e-main.js`, `selfserve-main.js`, `word-display-recovery-main.js` |
| Remote trust, sessions, navigation/retry | `reliability.test.js`, `page-recovery.test.js`, `browser-tools.test.js`; `login-main.js`, `browser-tools-main.js` |
| Resources/positioning/row recycling | `word-list-data.test.js`, `word-list.test.js`; `resource-loading-main.js`, `resource-performance-main.js`, `resource-scroll-main.js`, `word-list-main.js`, `next-clue-main.js` |
| Journal/settings/migrations | `progress-journal.test.js`, `settings.test.js`; `progress-journal-main.js` |
| Layout, tile input, hints | `menus.test.js`, `hints.test.js`, `babble-entry.test.js`; `zoom-layout-main.js`, `tile-undo-main.js`, `hints-main.js` |
| Reporting, chat protection, celebrations | `telemetry.test.js`, `diagnostics.test.js`, `username-link.test.js`; `diagnostics-main.js`, `add-safety-main.js`, `fireworks-reporting-main.js` |
| Startup, updater, packaged release | `startup.test.js`, `updates.test.js`, `packaging.test.js`, highlight/release-note tests; startup/highlight E2E, `npm run release:check`, native packaged/installer smoke checks |

`npm start` uses live sites and the normal development profile; it is not a fixture-only check. For an isolated interactive review use the launchers documented in `tools/preview/README.md`, or the offline `tools/preview-highlights.cjs` for What's New. Preview profiles retain their own settings; they are separate from installed player data, not necessarily fresh on every launch.
