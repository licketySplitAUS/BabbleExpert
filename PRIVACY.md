# Privacy information

Maintainer: **Lickety Split** ([licketySplitAUS](https://github.com/licketySplitAUS)).
Privacy questions: [licketySplitAUS@gmail.com](mailto:licketySplitAUS@gmail.com).

## Game, clues and other websites

Babble Expert displays PlayBabble and the selected clue website in embedded
browser views. Those services receive ordinary web requests and any words,
chat or account information you submit to them. They may use cookies and
process connection information such as your IP address. Their own privacy
practices apply; the app's usage-sharing switch does not control those services.

The main services are [PlayBabble](https://www.playbabble.com),
[Lickety's Clues](https://r46.me) and [Self Serve Clues](https://selfserve.r46.me).
External dictionaries and other Resources links contact the service you choose.
The **Create Clues** feature can be disabled in Options. When enabled, clicking a
found word in Babble, Lickety’s Clues or Self Serve sends that word to `https://api.datamuse.com/words` to look
up definitions. Definitions are cached in memory for the app session. Try again
can request a fresh lookup when there are no alternatives. Datamuse receives
ordinary connection information, including the source IP address. This lookup
is separate from anonymous usage sharing. The clue is sent to Babble chat only
when you choose **Send to Babble Chat**.
Installed editions also contact GitHub to check for and download updates.
See [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
Not every linked service's privacy policy has been independently verified.

## Optional usage sharing

The app asks permission on first run. Reporting does not occur unless you opt
in, and can be disabled later in Options. When enabled, reports include:

- A randomly generated installation identifier, app version, operating system
  and architecture.
- App startup and install/upgrade events, selected Resources/Options menu items and session
  duration. Fireworks starts (including automatic completion), manual previews
  and replays are reported as option usage. Expert sends one notification for
  its celebration; the embedded Clues page sends no separate browser-completion
  notice. No puzzle identifier, grid, found words or word counts are included. Only the first
  word-list resource opened per app session is reported, even if other resources
  are visited in between. Manual Self Serve Grab Grid clicks and switches between
  clue sources are reported as option usage. Automatic grid checks are not reported.
  Moving Resources from right to left and enabling Personal progress journal
  recording are also reported as option usage. Restoring saved preferences,
  opening the journal, disabling recording and moving Resources back right do
  not send these notices. Journal records and playing times are never included.
  Upgrade reports can include the previous app version.
- Approximate country and, after accepting the updated city-sharing consent,
  approximate city when available, determined by the receiving service from the
  network connection. City estimates can be inaccurate, particularly with VPNs
  or mobile networks. Older consent continues to permit country only; neither
  coordinates nor postal codes are forwarded.

These reports do not include entered words or chat messages. They include a
Babble username only after the separate, optional username-link permission below.
They go to `https://selfserve.r46.me/api/babble-notify`, hosted through Netlify,
and notifications are forwarded to Discord for the maintainer. A random ID
allows reports from the same installation to be associated over time. Discord also
shows a consistent generated first-name alias reserved for that random ID.
This is an automatically assigned label, not a real name collected from the user.

**Optional username link:** on **Send lickety a message**, a separate username
box and initially unticked checkbox let you explicitly link the username you
enter to this installation. Expert does not read your login fields or collect
your password. Sending with that checkbox ticked includes the username,
installation ID and permission with your message. After delivery and server
confirmation, the username and consent date are saved in local `settings.json`.
This is separate from the contact name and email supplied for one message.

Linked usernames accompany future usage and diagnostic reports only while
usage sharing is also enabled. Linking never enables that sharing preference.
Queued diagnostics do not acquire a link that was granted after their event.
Changing the linked username takes effect for subsequent events. **Remove
username link** on the message page clears the saved choice without sending a
message; later reports return to the generated alias. Reports already delivered
to Discord remain unchanged. Contact the maintainer with deletion requests.
The maintainer's statistics can show the most recently reported shared username
alongside the installation ID; older date ranges may still show an earlier
shared username. This is a self-reported label, not verified account ownership.
On shared computers, check which account the username represents before linking.

The same optional sharing setting also controls technical diagnostics. When
enabled, startup failures, unusually slow loading, page loading failures,
unresponsive or crashed pages, recovery, and failed update checking, downloading
or installation handoff can be reported. These reports include the random
installation ID and alias, app version, operating system/build, architecture,
total installed RAM, affected component, numeric or predefined error codes,
timings, update target version where available, a random report ID and the time
of the incident. They contain no page contents, full URLs, local file paths,
raw error messages, stack traces or location enrichment. They go through
`https://selfserve.r46.me/api/expert-diagnostics` to a separate maintainer Discord
channel. No diagnostic reports are sent before sharing has been enabled or
when that preference is unavailable. Existing opted-in installations use their
saved sharing choice; Options can disable it.

Up to 20 small diagnostic reports can be held locally in
`pending-diagnostics.json` if delivery fails, and retried on a later launch or
incident. Reports expire after seven days; disabling sharing clears the pending
queue. Repeated errors are suppressed within a session and requests have short
timeouts. The endpoint is rate limited. The underlying hosting service still
receives ordinary connection information as explained below.

Any server receiving an internet connection can see its source IP address;
not including an IP address in the app's JSON report does not prevent provider
connection logs. Hosting logs, downstream retention and deletion arrangements
have not yet been fully audited, and no fixed retention period is promised here.
Contact the maintainer with access or deletion questions.

Provider information: [Netlify privacy statement](https://www.netlify.com/privacy/)
and [Discord privacy policy](https://discord.com/privacy).

## Local storage and installer disclosure

The **Personal progress journal** has recording on by default and is
independent of anonymous usage sharing. You can pause it in **Options → Personal
progress journal**. The next update turns recording on once for existing
installations, including those previously set to off. Pausing after that is
remembered across restarts. When enabled, it stores up to 2,000
puzzle summaries in `progress-journal.json` in the app-data directory: puzzle
identifier/date, a hash of the grid for distinguishing puzzles, observed word
counts by length, up to five longest observed words, completion and observation
timestamps, and recorded active time. It does not store the raw grid, full word
list, chat or account details. The file stays on the device and is not encrypted
by Expert. Pausing preserves saved history. The journal window offers CSV export
and confirmed deletion; an exported copy is under your control. Journal records
are never included in usage notifications or diagnostic reports.
If anonymous usage sharing is enabled, turning journal recording on sends only
the predefined option-use label, with the usual anonymous usage fields above.
It sends no puzzle identifier, found words, counts, completion or journal time.

Public resource word lists are also cached locally in the app-data `word-lists`
folder. These contain dictionary words, not player progress. The app fetches
the existing hosted word-list pages as text and validates the words; hosted
scripts and images are not loaded by the packaged viewer. Fresh saved lists
need no request; lists older than a day refresh in the background when opened.

The guided tour opens only when selected from Help or Options and uses an offline demonstration grid and scripted words. It does not read your live puzzle, submit words or chat, contact Datamuse, or report viewing activity. Local settings remember whether the tour was completed. Technical tour-window loading failures, crashes, slow loading or responsiveness problems follow the optional diagnostic reporting rules above.

Settings and the random installation ID are stored in the app-data directory.
A local last-run version is also stored to recognise upgrades and show a
one-time version confirmation. This marker works without usage-sharing consent
and is not added to usage reports.
Local settings also remember a pending update announcement and the latest
version whose feature highlights you acknowledged with **OK**. These prevent
repeated update announcements and are not sent in usage or diagnostic reports.
The automatic feature summary is bundled with Expert and makes no network
request. Choosing Full release notes opens Help's existing release notes view.
Embedded sites can also retain browser data. Recent-entry history is kept in
memory for the current app session and is not included in usage reports.
Local `startup.log` and `startup.log.previous` files help diagnose startup and
window failures; the log rotates above 128 KiB. These local files may contain
exception details and local paths, are never uploaded automatically, and are
separate from the restricted diagnostic reports described above.

The current one-click installer does not display this document or offer a
usage-sharing option. Consent is requested by the app on first run instead.
Releases remain unsigned by the maintainer’s choice. This document describes the app’s behaviour and is not a completed privacy audit.

## Messages you choose to send

Options → Send lickety a message lets you send up to 500 characters. Nothing is
sent until you choose Send message. The message, any name or email address you
enter in the optional fields, and Babble Expert version are
forwarded to lickety through the site's Discord webhook. This is available
independently of anonymous usage sharing. No contact details are added
automatically. Add an email address if you would like a reply. Unsent drafts stay
only in the open message window.

Help → Copy support summary copies information only when requested. It includes the installed app/runtime version, anonymous installation alias, OS/architecture, pane and update health, and recent restricted diagnostic codes. Recent safe events are kept in memory even when sharing is off; copying does not send them. Restricted error details may include a known Error class and an app source module/line, never raw exception text or an absolute path.
