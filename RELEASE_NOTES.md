## What's new in Babble Expert 3.2.2

- **Visible manual update checks:** Options → Check for updates now shows checking, an up-to-date result with the installed version, or a clear error in the existing top bar. Results clear after 15 seconds; routine background checks stay quiet.
- **Download progress:** the top bar shows the update download percentage when available. A failed check is no longer incorrectly replaced by an up-to-date result.
- **Clearer Windows installation:** Update now / Install and restart saves settings, closes Expert, shows installer progress and reopens Expert automatically. Later installs silently when Expert closes, without reopening. The update prompt explains both choices and why the desktop shortcut stays in place.
- **Version confirmation:** the first launch after a detected upgrade briefly confirms the new version. Older installations without a recorded version show the running version instead. This local tracking does not require usage sharing and is not added to usage reports.
- **Help → Updates:** a new Help tab explains downloads, installation, restarting and what to expect on Windows and Mac, without taking more space from the puzzle.

## Downloads and updates

- **Windows:** run `BabbleExpert-Windows-Setup.exe`, or use the existing updater. The upgrade to 3.2.2 is controlled by your currently installed version; the new installer-progress behaviour applies to subsequent upgrades. If choosing Install and restart in 3.2.1, wait for Expert to reopen. If simply closing Expert, installation is silent and does not reopen it; allow installation to finish before using the shortcut.
- **Mac:** open `BabbleExpert-macOS.dmg` and replace Babble Expert in Applications. The universal app supports both Intel and Apple Silicon Macs.

The installers are unsigned, as with previous releases. Windows may show SmartScreen; on Mac, use the existing Open / Open Anyway steps if macOS blocks the app.

## Code signing policy

Our SignPath Foundation application has been received and is awaiting review.
This release is not signed by SignPath. See the [code signing policy](https://github.com/licketySplitAUS/BabbleExpert/blob/main/CODE_SIGNING.md),
[privacy information](https://github.com/licketySplitAUS/BabbleExpert/blob/main/PRIVACY.md) and
[security contact](https://github.com/licketySplitAUS/BabbleExpert/blob/main/SECURITY.md).
