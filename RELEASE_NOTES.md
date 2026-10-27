## What's new in Babble Expert 3.5.0

- **Hide Clues completely:** use Hide Clues in the strip between the pages to start solving without visible clues. Show Clues restores the previous width; Reload Clues also reveals the page. This works with Clues on either side.
- **Compact controls and clearer resizing:** both Send buttons and the resize control share the centre strip. Direction arrows follow the page order. The resize label reads “Click and hold, then move to Resize windows”. Updated label layout and native-view positioning reduce clipping during resizing.
- **Resources on the left by default:** new installations start with Resources on the left. Existing saved preferences are preserved. Options offers an explicit Move Resources to Left or Move Resources to Right action, with related menu items grouped by separators.
- **Helpful hints after the first session:** hints switch off after the first exit following this update. Options → Show helpful hints turns them back on, and a later manual choice is remembered. Disabled hints avoid unnecessary caption-dismiss messages.
- **Safer refresh and word syncing:** wait for Babble’s asynchronous saved-word list before reconciling words. Refreshing does not visibly re-enter words already present. Transfers and status checks discard stale page results after navigation. When a word is saved but its display update fails, Expert attempts a read-only saved-list repair, preserving the page and chat draft and keeping the remaining count and journal total consistent.
- **Clearer signed-out status:** the public Babble welcome page now shows Log in to Babble rather than Babble disconnected, with login guidance in the recovery bar.
- **Simpler journal wording:** recording status now ends with “Journal records stay on this device only.” Recording and saved pause preferences continue to work as before.
- **Tour removed for rework:** Help and Options no longer offer the outdated in-product tour. Its player and videos are excluded from installers, reducing the download. The written Help guide remains available. Tour source files are retained for future rework.
- **Reliability and diagnostics:** refreshing Babble restores remaining-word grid hints. Diagnostic delivery handles queued reports expiring during a request; local-window load failures retain safe error codes. Build dependencies include compatible security patch updates, and the release workflow includes the saved-word recovery regression check.

## Downloads and updates

The installed version is **V3.5.0.0**. Windows users can update from Options or the official Setup download. Mac users replace Babble Expert in Applications using the universal DMG, supporting Intel and Apple Silicon. Existing settings, logins and journal history are preserved.

Both installers remain unsigned by the maintainer’s choice. Follow the existing installation guide for system prompts.
