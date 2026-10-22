# Implementation status — 22 October 2026

The review fixes are implemented for the unsigned 3.2.12 release candidate. Publisher signing is explicitly declined by the maintainer; unsigned installation guides and checksum validation remain supported.

Transfers stop when their puzzle or clue revision changes. Renderer requests, idle waits and Mac checks have outer deadlines. Auxiliary windows reveal immediately and have bounded failure recovery. Privileged page access uses secure origins and expected local main-frame documents. Important diagnostics take priority, carry safe repeat counts and deduplicate delivered IDs on the backend. Help offers an explicit support-summary copy action; Options supports larger controls and keyboard-resizable panes. The tour remains manual-only.

The supporting site uses dated offline snapshots, rate-limited notification endpoints, production-only notification credentials and narrower history bundles. Private backup tooling exports state using a read-only credential and rehearses restoration in isolation, with health reporting and a missing-backup watchdog. See SelfServeClues/OPERATIONS.md for operational details.

Validation before remote build: 141 desktop unit tests and 105 supporting-site tests pass. The Electron integration suite and the new readability/support test pass on Windows. The supporting site passes type checking, production build and actual Netlify function packaging. A fresh unsigned Windows candidate passed packaged rapid-relaunch, cookie/settings persistence and no-auto-tour checks. CI additionally checks native Windows install/upgrade/shortcuts and packaged Mac startup; remote results must be checked before publishing. This does not replace physical Intel/Apple Silicon testing or exercise every real updater-download path.

No app release tag is created by this implementation. Dispatching Build installers creates reviewable artifacts without publishing a release.
