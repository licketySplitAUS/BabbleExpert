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
The optional **Create Clues** feature is off by default. When enabled, clicking a
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
- Install/upgrade events, selected Resources/Options menu items and session
  duration. User-triggered fireworks previews and replays are reported as option
  usage; automatic puzzle-completion fireworks are not reported. Only the first
  word-list resource opened per app session is reported, even if other resources
  are visited in between. Manual Self Serve Grab Grid clicks and switches between
  clue sources are reported as option usage. Automatic grid checks are not reported.
  Upgrade reports can include the previous app version.
- Approximate country, determined by the receiving service.

These reports do not include entered words, chat messages or usernames.
They go to `https://selfserve.r46.me/api/babble-notify`, hosted through Netlify,
and notifications are forwarded to Discord for the maintainer. A random ID
allows reports from the same installation to be associated over time.

Any server receiving an internet connection can see its source IP address;
not including an IP address in the app's JSON report does not prevent provider
connection logs. Hosting logs, downstream retention and deletion arrangements
have not yet been fully audited, and no fixed retention period is promised here.
Contact the maintainer with access or deletion questions.

Provider information: [Netlify privacy statement](https://www.netlify.com/privacy/)
and [Discord privacy policy](https://discord.com/privacy).

## Local storage and installer disclosure

The guided tour uses an offline demonstration grid and scripted words. It does not read your live puzzle, submit words or chat, contact Datamuse, or report tour activity. Local settings remember whether its invitation has been shown and whether the tour was completed; Help and Options allow replay at any time.

Settings and the random installation ID are stored in the app-data directory.
A local last-run version is also stored to recognise upgrades and show a
one-time version confirmation. This marker works without usage-sharing consent
and is not added to usage reports.
Embedded sites can also retain browser data. Recent-entry history is kept in
memory for the current app session and is not included in usage reports.

The current one-click installer does not display this document or offer a
usage-sharing option. Consent is requested by the app on first run instead.
Whether this meets SignPath Foundation's requirements remains to be confirmed;
this document is not a claim of Foundation approval or a completed privacy audit.
