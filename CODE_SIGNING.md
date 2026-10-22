# Distribution and code signing

Babble Expert is intentionally distributed **unsigned** on Windows and macOS.
The maintainer has decided not to pursue a paid signing service or Foundation
signing at this time. No current download is advertised as signed or notarized.

Installers are built from reviewed source using the GitHub release workflow.
The workflow verifies versions, installer hashes, update manifests and blockmaps,
and runs packaged application smoke tests. SHA-256 checksum files accompany
release installers. Checksums detect mismatched/corrupted assets; they are not a
replacement for publisher authentication or an operating-system signature.

The installation guides explain the operating-system prompts. Users should only
install releases from the official Babble Expert GitHub releases and linked
lickety websites.

Maintainer: [licketySplitAUS](https://github.com/licketySplitAUS).
Contact: [licketySplitAUS@gmail.com](mailto:licketySplitAUS@gmail.com).

The older SignPath preparation document is historical planning, not an active
application or a promise of future signing.
