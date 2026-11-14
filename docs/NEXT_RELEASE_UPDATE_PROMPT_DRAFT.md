# Next release update message — draft for review

Prepared for Babble Expert 4.0.0 (display version 4.0.0.0), including the requested Entries removal and Words Left completion indicator. RELEASE_NOTES.md and the bundled What’s New now contain the release wording.

The three bullets below are the proposed short What's New section for the next GitHub release. The download prompt reads the target release's published highlights, not the version already installed. A release can use an `Update highlights` heading to provide a shorter introduction than its full notes; otherwise the first three What's New bullets are used.

## What's new

- Removed Entries, with a simpler toolbar.
- Words Left moves right with rainbow completion indicators.
- 42 celebrations, with new effects added automatically.

## Proposed Windows message

**A Babble Expert update is ready to install**

What's new

- Removed Entries, with a simpler toolbar.
- Words Left moves right with rainbow completion indicators.
- 42 celebrations, with new effects added automatically.

Update now: saves your settings and journal, installs and reopens Expert. Please wait for it to reopen.

Later: keep playing. Installs silently when you close Expert, without reopening.

Buttons: **Update now** / **Later**. Later remains the default, including Enter/Escape/closing the prompt.

## Review and rollout

Open `Preview Update Message.cmd` for the real native prompt with this draft text. The title says PREVIEW; either button only closes the preview. It uses a temporary profile, makes no network requests and cannot install anything. Pass `--mac` to review the DMG wording on this computer; this does not verify native macOS presentation.

Once the wording is approved for a release, put the short bullets in that release's GitHub notes and prepare matching installed What's New content in `src/update-highlights.json` with the release metadata. This file is a review draft, not an automatic replacement for approved release notes.

Already-installed versions have their prompt code bundled in the application, so they will keep the previous message when downloading their first update to this implementation. Subsequent updates can show the shorter prompt and that target release's highlights.
