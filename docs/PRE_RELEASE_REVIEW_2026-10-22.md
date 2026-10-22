**Babble Expert pre-release review — 22 October 2026 (Sydney)**

Recommendation: make the next release a reliability update. Fix the confirmed rollover and timeout issues, finish window hardening, and validate a fresh packaged build before publishing. A redesign or framework migration is not needed.

This review covers the current working tree, including the pending startup, diagnostics, browser-tools and tour changes; the Electron app, preloads, page integration, settings, updates, UI, release workflow, and supporting Self Serve/legacy Netlify setup. Application code, dependencies and production settings were inspected. No application fixes, environment changes, deployments or live Discord messages were made during this review. This document is the review deliverable.

**1. Fix before release: bind bulk transfers to their original puzzle. Confirmed bug.**

Evidence: `src/engine.js:204–250`. `sendToBabble()` and `getFromBabble()` snapshot the word list, but each iteration only checks whether the two current panes match. Neither binds the operation to the puzzle/grid it started with.

Reproduction: pause the first bulk submission, change the engine from an old matching puzzle to a new matching puzzle, then resume. The old two-word list continued sending both words. The native reconciliation path already has a stronger context guard.

Fix: capture puzzle ID, grid letters and clue revision for the entire transfer. Stop remaining work on a change, report a clear paused result, and require an explicit fresh transfer. Check context again across asynchronous boundaries. Also review single-word clue writes at `src/engine.js:307`: an unknown match (`null`) currently permits writing to Clues. Send to Babble independently when necessary, but write Clues only with a confirmed or explicitly retained matching puzzle identity.

**2. Fix before release: put deadlines outside the embedded renderer. Confirmed failure path.**

Evidence: `src/pages.js:51–60`, `src/engine.js:69`, `src/engine.js:190`, `src/app.js:167`. `executeJavaScript()` has no outer deadline. The five-second timer in the injected word script depends on that renderer still running. A frozen renderer can prevent polling, a submission, or `whenIdle()` from completing. Installation preparation then waits indefinitely.

Reproduction: substitute an unresolved renderer operation; the page state request remains pending with no main-process deadline. A thrown error is handled, but a promise that never settles is a different case.

Fix: use bounded main-process operations, reject on navigation/destruction/crash, discard late results, and give update preparation a bounded wait with a retry/cancel explanation. Do not blindly retry an uncertain chat submission or word request: it may already have reached Babble.

**3. Fix before release: make Mac update checks recover from a hung request. Confirmed bug.**

Evidence: `src/updates.js:32–40` and `src/updates.js:161–194`. `latestRelease()` does not pass an abort signal or deadline. The outer `checking` flag remains true until that promise settles.

Reproduction: hold the Mac release fetch unresolved, then request another check. Only one request occurs and the state remains `checking`; the second request cannot recover it.

Fix: add a deadline and cancellation on shutdown, release the checking state, and let a later check retry. Distinguish checking, downloading and installer preparation. Windows uses the updater library's network implementation; its timeout/cancellation behaviour needs a packaged test rather than assuming it matches the raw Mac fetch.

**4. Fix before release: update the Electron patch and retest the package. Confirmed version gap.**

The lockfile and installed dependency use Electron **44.7.2**. The official **44.9.3** release, published 20 October, includes upstream Chromium, ANGLE, PDFium, Skia and V8 fixes. Prefer the compatible 44.x patch for this reliability release, with a separate assessment for the 45.x major upgrade. [Official 44.9.3 release notes](https://releases.electronjs.org/release/v44.9.3).

The app dependency audit reports **zero production dependency advisories**, and **eight moderate affected packages in the development/build tree**, tracing to `sprintf-js`. The upstream advisory currently lists no patched version, so do not run a forced audit fix that downgrades the whole builder. Assess exposure and the builder's dependency route deliberately. An npm audit does not establish that the bundled Chromium runtime is fully patched. [Advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).

**5. Fix before release: apply the window-loading protections to the other local windows. Confirmed coverage gap.**

Evidence: `src/app.js:125`, `src/app.js:501–598`. Zoom, Recent entries, Send lickety a message, Help and Create Clues still have unhandled `loadFile()` promises and/or depend solely on `ready-to-show`. Main and Tour now have stronger handling.

Fix: a small shared local-window helper should handle visibility, one window per feature, rejected loads, renderer failure, loading deadlines, cleanup, and returning focus. A failed auxiliary window should close itself and leave the game usable. Keep feature-specific policy: a main-window failure is different from a failed Help window. Test failed loading and rapid reopening, including the modal Recent entries window.

**6. Fix before release: reserve diagnostic capacity for important failures. Confirmed bug in the new reporting code.**

Evidence: `src/diagnostics.js:98–103`. A full 20-item queue rejects every new report, including `startup-failed`. The session's 20-key allowance can also be exhausted by lower-priority incidents.

Reproduction: preload 20 pending page errors, start flushing through a held transport, then report a startup failure. The fatal report is rejected and is not saved.

Fix: give startup failures and crashes priority; evict or summarise older low-priority repeats, and preserve a repeat count. Keep the existing size, age and consent limits. Add server-side report-ID deduplication for retries after ambiguous delivery: the receiver currently forwards the same report ID again. Also add safe exception class and application-module/line information; many startup exceptions have no numeric code, so the current generic report may not explain the cause. Never upload raw stacks, paths or page contents automatically.

**7. Fix before release: build and test one complete release snapshot. Confirmed setup hazards.**

The working tree has substantial uncommitted changes and new, untracked modules. Current HEAD and the latest public release are still **3.2.11**. Local `dist/latest.yml` and the existing Windows installer describe **3.1.2**, from 16 October. That local installer is not a candidate for the next release.

Commit the complete reviewed source, update package/build/lockfile versions and release notes together, and build fresh artifacts from that commit. Add a workflow check that the tag, package version, build version and update manifests agree. Archive the previous release notes. Publish the installer, its blockmap and `latest.yml` from the same build.

The workflow runs app tests on Linux, then builds Windows and Mac installers. It does not smoke-test the packaged applications on those platforms. Add a clean Windows install/reopen/shortcut test and an upgrade from 3.2.11, covering both Update now and deferred installation, rapid reopening and saved settings. Add Mac packaged startup and manual replacement checks for the supported Intel/Apple Silicon configurations. Current successful source tests do not prove the new installer works.

**8. Fix soon: tighten page origins and privileged IPC checks. Confirmed hardening gaps; no compromise demonstrated.**

Evidence: `src/pages.js:51–59`, `src/app.js:206–226`, `src/app.js:773`. Page scripting checks hostname, not the complete allowed origin. A controlled test accepted `http://playbabble.com:8080/` as a scriptable Babble page. Core IPC checks window identity but does not consistently check the main frame and expected local document; newer Help/Tour/Zoom bridges do stronger frame checking.

Fix: use explicit HTTPS origins for production page integration, keep localhost allowances confined to tests, and apply a consistent window/frame/document check to privileged bridges. Keep external resource browsing separate from the hosts eligible for Babble integration. Extend the existing sandbox, context isolation and narrow preload design rather than widening permissions. [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

**9. Fix soon: rate-limit the older public Discord endpoints. Confirmed infrastructure gap.**

Evidence: SelfServeClues `netlify/functions/lickety-message.mjs:35` and `babble-notify.mjs:98`. These public routes forward accepted reports to Discord without a configured rate limit. The newer diagnostics, fireworks and guide routes already have limits.

Fix: add appropriate per-IP/domain limits, consistent request content-type/body checks and runtime environment access. Origin checks can reduce browser-origin abuse but are not authentication for a desktop client. Do not embed a reusable shared secret in Expert. Prevent notification floods from consuming Discord limits or filling the message channel. No abuse traffic was sent during this review.

**10. Fix soon: make initial clues fallback work on network exceptions. Confirmed code path.**

Evidence: SelfServeClues `src/history/App.tsx:20–38`. The imported snapshot fallback is attempted after an HTTP error or unexpected content type, but a thrown fetch/timeout goes directly to the outer catch and bypasses it.

Fix: handle exceptions around the primary request and deliberately choose an available fallback. Prefer a last-known-good published snapshot, display its puzzle date, and show a prominent stale/offline notice. An imported snapshot may be older than today's puzzle; do not silently present it as current or forward its words into a new puzzle.

**11. Fix soon: lock and refresh the supporting site's build dependencies. Confirmed setup gap.**

SelfServeClues has no root dependency lockfile. Standard `npm audit` fails with `ENOLOCK`. I audited its installed tree by copying the hidden installed-package lock into a temporary directory with the root package metadata; the repository was left unchanged. That snapshot reports **18 high-severity affected packages in development/build tooling** and **zero production dependency advisories**. The affected tooling includes Vite and Netlify CLI dependencies; these counts are affected packages, not 18 independent vulnerabilities.

Commit a reviewed lockfile, use reproducible installs, and update compatible Vite/CLI dependencies with tests. Vite 8.0.13 is within a documented Windows development-server advisory range; that advisory's exploit conditions concern an exposed development server, not proof that the deployed static clues site is exploitable. Avoid forced audit fixes suggesting a drastic Netlify CLI downgrade. [Vite maintainer advisory](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff).

**12. Recommended: make support easier for players.**

Add Help → Copy support summary with installed version, anonymous alias, OS, pane health, recent safe error codes and update state. Explain “Expert did not open” versus “Expert opened but Babble did not load.” Offer targeted Retry and Open in browser actions. Preserve entered drafts when an operation is uncertain. A local log remains useful when sharing is off or the network is unavailable.

**13. Recommended: make the whole interface readable at larger sizes.**

Evidence: `src/ui/main.css:3` uses 12px toolbar text, while `src/app.js:188` applies Zoom only to embedded page views. Add a separate large-interface option so toolbar controls, status messages and recovery actions also enlarge. Make pane dividers keyboard-operable and expose their values. Existing focus outlines, text feedback alongside flash colours, Help tabs and native recovery controls are useful foundations.

**14. Recommended: finish the signing work as a separate infrastructure milestone.**

The checked build configuration disables signing discovery, and project documents say SignPath approval is pending. I did not verify provider approval externally. Once approved, add signing and verification to CI without allowing a failed signing step to produce an artifact advertised as signed. Mac signing/notarization is separate. This reduces the installation barriers that the current guides explain. [Electron signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing).

**15. Recommended: keep the infrastructure smaller and prove recovery.**

Both Netlify production deployments were ready, SSL enforcement was enabled, main clues returned the correct title, and publication status was live. The cached small version endpoint is a good design. The real function packaging check passes, but every `history-*` function currently includes about 8.9 MB because of the blanket archive inclusion rule. Narrow that rule for small launch/publication/chat-setting functions when practical.

Secret metadata confirms dedicated webhook variables are saved as secrets. Some existing Babble credentials and webhook variables also cover preview/dev contexts; separate production and test destinations deliberately. Avoid forwarding preview experiments into production channels or using production login credentials unnecessarily.

Recovery/export tooling and checksum tests are present. The scheduled GitHub backup workflow in this repository is explicitly a template under `tools/recovery`, not an active workflow here. A separate private backup repository was not verified. Verify where backups actually run, alert on failure, and rehearse restoring into an isolated store. The next Central-midnight production rollover was not observed during this review.

**Validation performed**

- Desktop: **134 unit tests passed**.
- Supporting site: **99 tests passed**, TypeScript checking and Vite production build passed.
- **18 distinct Electron integration scripts passed**, including startup, diagnostics, login, tour, browser tools, main UI, layout/zoom, both clue sources, native bulk paste, tile undo, Create Clues, messaging, release notes, resource relay/scrolling/performance, word lists and fireworks. Bulk-paste and Self Serve scripts initially reported missing fixture environment variables; both passed after their documented fixture paths were supplied.
- Netlify's real function bundler passed archive-size, route, schedule and lightweight-version-package checks.
- Read-only production HTTP, deployment metadata, secret metadata and public GitHub release/workflow checks completed. The last three published app-release workflows succeeded; they predate these pending changes.
- Controlled reproductions confirmed bulk rollover continuation, absent outer renderer deadlines, a stuck Mac release fetch, acceptance of an unexpected HTTP origin/port, and loss of a new fatal report when the diagnostic queue is full.

Scope limits: these are code, configuration and automated test findings. No new installer was built or installed, no fresh physical Mac validation or signing validation was performed, and this is not a complete penetration test or provider-account audit. The older intermittent Windows UI-test failures were not reproduced in this pass; the full main app test passed on this run.

Suggested implementation order: transfer identity and timeouts; remaining local-window protections; diagnostic priority; compatible Electron patch and origin checks; clean release/version validation and native package smoke tests. Address public endpoint limits, the site lockfile/tooling and fallback handling alongside that work. Add interface enhancements after the reliability changes are verified.
