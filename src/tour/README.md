# A day in Babble Expert

A 6-minute 46-second, captioned tour in ten chapters. It plays selected recordings of the real Babble Expert application, PlayBabble, Lickety's Clues and Self Serve. The recorded grid is an example: playback never changes the viewer's puzzle or sends chat.

## Edit or extract

- `content.mjs`: chapter order, captions, reading time, footage references, focus rectangles and optional reading holds. Each beat is independent; changing a chapter always starts playback.
- `timeline.mjs`: pure chapter/beat lookup and recorded-media time, including held frames.
- `footage.mjs`: local WebM decoding, double buffering, seeking, pause and load recovery.
- `player.mjs`: transport, progress, chapter navigation, camera, callouts and cursor presentation.
- `motions.mjs`: cursor annotations from the capture action log.
- `media/`: 29 edited VP9 WebM clips (about 54 MB) and their manifests. Only these selected clips ship.
- `index.html` / `tour.css`: the player shell. Website pixels come from the recordings; there is no reconstructed website renderer.
- `../tour.js` / `../preload-tour.js`: Electron invitation, replay window and local completion preference.

Copy this directory and serve it with a static HTTP server to run the tour independently. The optional `window.tourHost` adapter provides launch preferences and close/completion actions. `window.BabbleTour` provides play, pause, seek, chapter navigation, chapter ranges and playback state. Chrome/Electron's built-in VP9 decoder plays the footage without external downloads or streaming.

Raw takes, capture inventories and editing previews remain under `tools/tour-capture/`, outside the packaged `src` tree. Do not distribute them. The reproducible cut list and privacy masks are in `tools/tour-capture/edit.js`; it requires FFmpeg with libvpx-vp9. Set `TOUR_FFMPEG` and `TOUR_FFPROBE` to use another installation. Run `node tools/tour-capture/edit.js` after replacing raw takes, then verify the exported clips and manifests. Action pauses are shortened; captions can hold on actual recorded frames for reading.

The account banner and unrelated public chat are obscured in selected footage. The chat example remains an unsent draft. The tour omits sign-in, Entries and the celebration feature. Recordings show typing and grid clicking in Babble and both clue sites, Lickety Add feedback, clicking resource words, keyboard searching, word-length changes, bounded clue lookup, clue-source switching, the Off filter, pane/entry-box positioning, chat instructions, Fun Word Play, Chill Vibes and Create Clues with retry/edit controls.

## Invitation and controls

The tour opens only from Help or Options. Startup, login, puzzle readiness and upgrades never launch it automatically. It appears immediately without maximizing, fits the active display, and repeat clicks reveal the same window. A failed local load, renderer crash or 60-second loading timeout closes only the tour and restores Expert. Optional technical diagnostics identify the `tour` component. `tourPromptVersion` is retained for compatibility with older installations and the explicit invitation preview in tests; `tourCompletedVersion` remembers completion. Increment `TOUR_VERSION` in both `content.mjs` and `../tour.js` for a major revision.

The separate window opens maximised for readable website text. Play/pause, previous/next chapter, direct chapter selection, seeking, elapsed/total time, speed, Cinema view and Less motion are built in. Every chapter-selection action starts playing, including when previously paused. Space/K toggles playback; Left/Right seeks five seconds; Home/End seeks to an endpoint; Escape closes the tour. Standard keyboard activation remains available on controls. Less motion respects the system preference and removes camera/cursor decoration. Active product controls remain sharp; only the selected account/chat areas in the footage are blurred. The player pauses when hidden.

## Verification

`node --test test/unit/tour.test.js` checks captions, chapter boundaries, packaged clip references, reading holds and invitation persistence. `node test/e2e/run.js tour-main.js --no-sandbox` decodes every referenced clip in a hidden Electron window and checks navigation, play-on-chapter-change, invitation/skip/replay, seeking, completion, reduced motion and window sizing. It writes local QA images to the temporary directory printed on completion. Set `TOUR_ASAR` to a tour archive path to repeat playback/seeking checks from an Electron ASAR package.
