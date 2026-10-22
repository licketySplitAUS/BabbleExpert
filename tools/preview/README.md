# Helpful hints local preview

Open `Preview Helpful Hints.cmd` from the project root, or run:

    node tools/preview/start-hints.cjs

The window is titled **TEST PREVIEW: Helpful hints**. Hover over an Expert toolbar or Add control for one second, or use Tab to focus it. Clicking, typing, Escape and moving away dismiss the caption. Options → Show helpful hints changes the setting immediately. Larger toolbar and controls also enlarges captions.

This preview uses its own temporary settings/login profile and makes no changes to the installed Expert profile. It does not check for updates or send usage/diagnostic notifications. Babble and the Clues page load normally, so signing in again may be needed to use the game in the preview. No installer or release publication is required.

The existing `hideHints` setting is retained: installed users who previously hid hints will still have them disabled when this feature is released. New profiles default to hints enabled.
