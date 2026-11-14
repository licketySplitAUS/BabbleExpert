# Helpful hints local preview

For the shorter download-ready update message, open `Preview Update Message.cmd`
or run `node tools/preview-update-message.cjs`. It shows the real native message
using `docs/NEXT_RELEASE_UPDATE_PROMPT_DRAFT.md`, with a PREVIEW title. Either
button closes the preview; no updater or installer runs and no network requests
are made. Electron runs in a temporary working directory/profile. Add `--mac`
to review the DMG wording (this is not a native macOS test).
The launcher opens a visible owner window before the native message. If startup
fails, its console stays open with the error instead of disappearing.

For the local reliability build **3.5.0.1**, open `Preview Reliability 3.5.0.1.cmd`
or run `node tools/preview/start-reliability.cjs`. It uses a separate persistent
temporary profile and live websites, with update checks and reporting disabled.
This historical preview retains its 3.5.0.1 label and separate profile. Its reliability changes are included in the 3.6.0.0 release.
The local build retries disconnected sockets during safe initial navigation,
allows more time for notification acknowledgements, saves acknowledged upgrade
markers immediately, and identifies known local windows in consented diagnostics.

For the Clues layout prototype, open `Preview Clues Layout.cmd` or run
`node tools/preview/start-clues-layout.cjs`. This opens a separate preview profile.
Try Hide Clues / Show Clues on the yellow divider, Reload Clues while hidden,
and Options → Switch Sides. The hidden state and previous width are remembered.
The narrow divider combines Hide/Show, Send to Clues, Send to Babble and a
labelled resize grip. Send arrows follow Switch Sides, and the transfer controls
leave the toolbar. The public Babble preview now shows Log in to Babble.
No installer or release is published.

Open `Preview Helpful Hints.cmd` from the project root, or run:

    node tools/preview/start-hints.cjs

The window is titled **TEST PREVIEW: Helpful hints**. Hover over an Expert toolbar or Add control for one second, or use Tab to focus it. Clicking, typing, Escape and moving away dismiss the caption. Options → Show helpful hints changes the setting immediately. Larger toolbar and controls also enlarges captions.

This preview uses its own temporary settings/login profile and makes no changes to the installed Expert profile. It does not check for updates or send usage/diagnostic notifications. Babble and the Clues page load normally, so signing in again may be needed to use the game in the preview. No installer or release publication is required.

The existing `hideHints` setting is retained for the first session. Helpful hints turn off on the first exit after this change; later manual re-enabling through Options is remembered. New profiles start with hints enabled for their first session.
