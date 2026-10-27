# Helpful hints local preview

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
