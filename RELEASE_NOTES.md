## What's new in Babble Expert 3.2.6

- **Smoother resources:** word lists stop their scrolling animation loops when idle. Native middle-button autoscroll takes priority over mouse-position scrolling, including after releasing the middle button. Search uses cached text and a binary lookup, with one centring operation per input.
- **Lighter highlights:** grid glow effects cover the selected letters instead of the entire viewport, pause when unused, and combine page-scroll redraws into one per frame. Scrolling nested word/chat lists no longer rebuilds the grid overlay.
- **Responsive background work:** slow polling and hint scans cannot accumulate overlapping work. Normal puzzle-status checks avoid serializing the entire Babble page. Highlight searches reject impossible letter combinations quickly and have a bounded search budget on ambiguous grids.
- **Click again to unselect:** on Babble and both clues grids, clicking the last selected tile again removes it from the word. Qu removes both letters; equal letters on different tiles still append normally. Letter highlights follow the shortened word.
- Includes the guided tour, anonymous notification aliases and other features from 3.2.5.

## Downloads and updates

- **Windows:** use Check for updates in Options, or run `BabbleExpert-Windows-Setup.exe`.
- **Mac:** open `BabbleExpert-macOS.dmg` and replace Babble Expert in Applications. The universal app supports Intel and Apple Silicon.

The installers are unsigned, as with previous releases. Follow the existing installation guidance in Help if Windows or macOS asks for confirmation.

## Code signing policy

Our SignPath Foundation application has been received and is awaiting review.
This release is not signed by SignPath. See the [code signing policy](https://github.com/licketySplitAUS/BabbleExpert/blob/main/CODE_SIGNING.md),
[privacy information](https://github.com/licketySplitAUS/BabbleExpert/blob/main/PRIVACY.md) and
[security contact](https://github.com/licketySplitAUS/BabbleExpert/blob/main/SECURITY.md).
