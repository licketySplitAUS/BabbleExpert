# Babble Expert: agent guide

## Scope and priorities

This is `licketySplitAUS/BabbleExpert`, the Windows/macOS Electron app. It embeds PlayBabble and either clue source, synchronizes words, and supplies Lickety Add, Resources, local journals and updates.

Related repositories own different layers: `Babble` supplies public pages/word lists/routing; `SelfServeClues` owns modern clues and Netlify APIs/history/reporting. Fix the owning layer and read its guide before cross-repository edits. Hosted changes and installer releases are separate operations.

Many players are older or unfamiliar with complex interfaces. Use plain labels, compact controls and readable feedback; preserve puzzle space. Recover transient failures quietly with bounded retries, retaining drafts and progress. Responsiveness with Resources open is a priority. Use existing infrastructure without new recurring costs.

## Commands and checks

Use Node 22+ and the committed lockfile; `npm ci` only when dependencies need installation.

| Task | Command |
| --- | --- |
| Development app (live sites, development profile) | `npm start` |
| Unit suite / one unit file | `npm test` / `node --test test/unit/engine.test.js` |
| Main fixture integration | `npm run test:e2e` |
| Focused Electron test | `node test/e2e/run.js <test-file.js> --no-sandbox` |
| Live clues integration | `npm run test:real-clues` |
| Release metadata | `npm run release:check` |
| Local package without publishing | `npx electron-builder --publish never` |

Use the E2E wrapper to isolate Electron's working directory/environment. Resource tests may need `WORD_LIST_DIR` pointing to the Babble checkout; exact coverage is in the workflow/reference. Use `tools/preview/README.md` for isolated interactive previews.

Extend a suitable existing test before adding another; cover behaviour and important failure paths. Start with affected checks and broaden for integration/release risk. Prefer injected clocks or condition waits over arbitrary sleeps. Inspect relevant UI resize/zoom/side/hide states. Docs need no app tests; Windows tests do not establish native macOS success.

## Navigation

| Area | Start here |
| --- | --- |
| Startup, windows, application wiring | `src/main.js`, `src/app.js`, `src/startup.js` |
| Pure orchestration and external-page adapters | `src/engine.js`, `src/pages.js`, `src/page-runtime.js`, `src/page-recovery.js` |
| Trusted bridges and packaged UI | `src/preload-*.js`, `src/local-window.js`, `src/ui/` |
| Resources and virtualized word lists | `src/resources.js`, `src/word-list-data.js`, `src/word-list-index.js`, `src/ui/word-list.js` |
| Local state, consent, updates | `src/settings.js`, `src/progress-journal.js`, `src/telemetry.js`, `src/diagnostics.js`, `src/updates.js` |

Read the relevant section of [implementation reference](docs/AGENT-REFERENCE.md) for synchronization, resource formats, IPC/session trust, journal persistence, release mechanics and focused tests. Consult `README.md` for user behaviour, `PRIVACY.md` for reporting, and `CODE_SIGNING.md` plus `.github/workflows/build.yml` for releases. Dated plans are context, not proof of current behaviour.

## Code Review Rules

For reviews, report actionable defects with a concrete trigger and file/line evidence, not style preferences. Check changed code against these contracts:

- Keep sandboxing/context isolation on and Node integration off. Validate IPC sender, top frame, expected document/host and payload; expose only named operations.
- Match transfers using the 25 grid letters, not the legacy clue number. Preserve page-revision guards, shared submission queues, saved-word readiness, bidirectional reconciliation and All/On/Off.
- Green = confirmed accepted; amber = duplicate or uncertain/Clues-only; red = explicit rejection. Timeouts never justify blind submission replay.
- Current Expert parses hosted lists as validated text into a packaged virtualized viewer. Older apps execute hosted list scripts. Preserve both contracts; bound per-input work and avoid full-list DOM scans.
- Preserve session boundaries, atomic state writes and deliberate one-time migrations. Unreadable journal data must not be silently overwritten. Normal browser storage does not automatically synchronize with Expert.
- Keep chat/bulk-word safeguards, optional usage consent, separate username-link consent and local-only journal records. Expert owns embedded fireworks; standalone clues remain independent.

## Execution and delivery

Find relevant symbols before reading large files; use saved failure logs rather than repeating unchanged checks. Batch related edits before rebuilding. Resolve minor choices autonomously and plan substantial work briefly. Follow existing CommonJS/UI patterns; comments should explain non-obvious reasons. For new dependencies, assess startup, memory and installer size.

Preserve unrelated edits and inspect branch/upstream state before reconciling a dirty checkout. Commits, pushes, tags, releases, deployments and real messages require task authorization; reuse authorization already given for that task. Historical approvals do not authorize new work. Keep prototypes local when requested.

For a requested release, prepare concise player-facing What's New text and honour requested wording approval. Include visible improvements and brief speed/reliability benefits; omit internal tracking/diagnostics. Distribution is intentionally unsigned. The workflow creates a draft release; authorized publication and verification of installers/updater metadata are separate final steps.

Inspect final changes, including new files, for scope drift. Report behaviour, checks and limitations per repository; distinguish local, pushed, hosted and installer changes.

Reviewed 29 October 2026. Update this guide alongside changed commands/contracts. Retain recurring, non-obvious rules; remove superseded guidance. Later explicit instructions take precedence.
