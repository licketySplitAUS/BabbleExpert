# Diagnostics review — 26 October 2026

The supplied report covers observed posts from 17–26 October, across several
versions. It contains 55 client-reported problem occurrences and six recovery
notices. Occurrences are not verified distinct failures; old Windows updaters
could report a single failure twice. These data cannot establish a failure rate
or identify the cause of an exception without its technical details.

## What users likely experienced

| Category | Reported occurrences | Existing experience |
| --- | ---: | --- |
| Update check failures | 32 | Background failures are hidden by the main UI; the installed version remains usable. A manual check gives inline feedback. Checks already recur every 30 minutes. |
| Page load failures | 14 | The affected pane immediately displays the native network error and a refresh suggestion. Word transfers pause. Other panes can remain usable. |
| Not responding | 4 | The affected renderer may briefly stop repainting or accepting input. Web panes show an inline recovery state. A matching responsive event clears it. The two main-window reports have no matching recovery notice in this selection; their eventual outcome is unknown. |
| Slow loading | 4 | A diagnostic threshold was crossed (10 seconds for the main window, 30 seconds for web panes). This alone produces no popup and does not prove the page ultimately failed. |
| Startup exception | 1 | A genuine startup failure can prevent opening Expert and show a restart instruction. The report supplies no exception type/source, so no specific cause can be responsibly inferred. |

The six recovery notices comprise two responsive notices and four slow-load
completions. Reports can overlap for one incident (for example, a main window
can be both slow to load and unresponsive).

## Plan implemented

1. For an HTTP(S) GET page explicitly opened by Expert, retry transient network
   errors after 2 seconds and then 6 seconds. Show a small “Reconnecting…” page
   while waiting. After two failed retries, show only a plain connection/refresh
   suggestion. Never expose the native error text or automatically retry forever.
2. Cancel retries when the user navigates elsewhere, opens another resource,
   hides Resources, closes Expert, or the renderer crashes. A fallback document
   is not a healthy puzzle and cannot enable word transfers.
3. Do not replay page-originated navigations or redirected requests, which might
   involve forms. Do not retry word/chat submissions, certificate errors or
   renderer crashes. Do not reload merely slow or temporarily unresponsive pages:
   that could discard unsent text and unchecked Clues progress.
4. Retry transient update-check/download failures after 30 seconds and then
   2 minutes on Windows and Mac. Background checks retain silent error handling;
   a manual check retains its brief inline feedback. Existing regular checks
   continue afterwards. Do not automatically retry installation, signature/feed
   validation errors or permission failures.
5. Retain diagnostics for investigation. The existing pending work already
   extracts safe updater codes, deduplicates Windows emitted/rejected failures,
   and records allowlisted exception types and source locations. Those details
   are needed to distinguish offline/rate-limit errors from release-feed faults
   and to investigate the unspecified startup exception. Do not conceal fatal
   startup exceptions or assume that rerunning partially completed startup is safe.

## Verification

- Unit coverage for retry limits/backoff, successful recovery, cancellation,
  subframes, cancelled loads, stale failures and requests that must not replay.
- Updater coverage for Windows/Mac bounded silent retries, successful recovery,
  permanent errors and shutdown cancellation.
- Real Electron integration with a local HTTP server: interrupt a Babble request,
  recover automatically, then keep the server unavailable and verify exactly two
  retries, a plain refresh suggestion and disabled word transfers. Existing
  diagnostic privacy and opt-out checks remain included.

Changes are prepared for the next release in source only. No installer was
published, and existing users have not received these changes yet. After release,
review new-version diagnostics separately from delayed reports from old versions.
