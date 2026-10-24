# Resource viewer and private progress journal

## Intended behaviour

1. Replace the embedded full word-list document with a packaged viewer. Read the existing hosted lists as text, validate sorted word data, cache successful lists locally, and render only visible rows plus a small buffer. Keep typing, centred clue lookup, N/P, right-click, +/- lengths, clipboard copying and confirmed result colours. A puzzle change clears results; a stale fetch must never position or reveal the wrong resource.
2. Add an optional Personal progress journal under Options. Recording starts disabled and is separate from anonymous usage sharing. Store only local puzzle summaries, observed completion, recorded active time, found counts by length and the longest observed words. Show when tracking began after some words were already found. Pause preserves history; export and confirmed deletion are available. No journal data is sent over the network.

## Implementation and verification

- Bound and validate source reads, cache sizes and file contents. Keep the existing good cache after a failed refresh and allow saved words offline.
- Use a fixed row height and binary-search positioning. Recycled rows must lose old colour, title, selection and pending state before representing another word.
- Read journal word counts and puzzle identity in one Babble snapshot, independently of Clues availability, and only when recording is enabled. Count foreground activity, excluding five-minute idle periods, sleep, lock, disconnection and time between launches. Label this recorded active time, not total solving time.
- Save journal checkpoints atomically and flush at shutdown/update/suspend. Preserve unreadable files until the user explicitly clears them. Keep at most 2,000 puzzle summaries.
- Unit tests: parsing/validation/cache expiry and fallback; range/search bounds; opt-in, identity, duplicate snapshots, restart, partial starts, completion, timing gaps, corruption, export and deletion.
- Electron tests: large real lists, bounded DOM, first/last positioning, recycled colours, zoom/resize, existing navigation, stale loads/failures/Hide; journal UI, trusted IPC, persistence and absence from telemetry.
- Measure against the same local word-list fixtures. Existing 8-letter list: **28,514 word elements**, 222 skipped groups, ~21.2 ms layout across 40 forced width changes after existing grouping, ~21.2 ms restoring 299 result rows (24 October 2026, this Windows machine). These timings are diagnostic, not portable pass thresholds.

No installer build, release tag or app publication is part of this work.

## Compatibility with installed apps

These two features are packaged with Expert. They require no deployment to Babble's hosted resource pages or the Clues websites. Older Expert releases keep loading the existing HTML word lists and their original scripts; the new viewer reads those same lists as validated text. It never executes the hosted scripts. The journal uses the existing Babble DOM and needs no website API or network storage.

For future website features, preserve existing URLs, clue functions (`GetAllWords`, `AddBabbleWord`, `showAll`), DOM hooks and existing request/response fields used by released apps. Ship compatible additions first. A newer app should explicitly request a named, versioned capability before a website enables behaviour that changes this contract; absent or unknown capabilities must retain legacy behaviour. Prefer versioned endpoints or data formats for incompatible changes. Keep any website-only feature switch off by default for embedded clients until capability support is verified. Do not assume all users installed the latest Expert release.

Before deploying a change to shared pages, check it with the current production app contract as well as the new one. A source-code push, website deployment and Expert installer release are separate operations; this work does not authorise an app release.

## Measured result

With the same 28,514-word, 8-letter fixture, the packaged viewer rendered **57 word rows**. A sample run measured ~5.4 ms layout across the same 40 forced width changes and ~2.4 ms restoring the same 299 results. Reapplying unchanged results caused zero row mutations. The complete local viewer navigation and setup took ~217 ms; parsing the source took ~15.6 ms. Timings vary by machine and are reported as diagnostics. Bounded rendered rows, correct positioning and result restoration are test assertions.

Validation includes unchanged source pages for every word length, daily background refresh with immediate saved-list display, lookup bounds, list recycling and puzzle resets, N/P/right-click navigation, slow/failed/stale loads, hover scrolling, journal opt-in and persistence, completion and official total corrections, bounded retention, export and confirmed deletion, hostile-window IPC rejection, and separation from telemetry.

Local verification completed on 24 October 2026: **170 unit tests passed**; Electron checks passed for resource performance, loading, scrolling, word results, clue navigation, resource input relay, journal UI and reliability controls. Source release-metadata validation passed with version **3.2.12 unchanged**. The journal export test waits for the completed write, rather than merely the new file's existence. Desktop and narrow-window journal screenshots were inspected. Both website repositories remained unchanged. No installer or deployment was produced.

Follow-up compatibility fix: the live Babble page loads Prototype, which replaces `Array.from` with `$A` and ignores its mapping callback. Optional word snapshots now use `Array.prototype.map.call`, matching the existing word-reading method. The page unit test and rendered journal test reproduce this override and verify recording works. All 23 focused page/journal unit tests and the journal Electron check passed after the fix. A running development app must be restarted to load this main-process change.
