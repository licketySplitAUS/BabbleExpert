# Code signing policy

## Current status

Babble Expert's current release installers are unsigned. The project is
preparing an application to SignPath Foundation; approval and signing access
have not been granted. Nothing on this page asserts that a current download
has a SignPath signature.

Maintainer and current source reviewer: **Lickety Split**, GitHub
[`licketySplitAUS`](https://github.com/licketySplitAUS).
Security/privacy contact: [licketySplitAUS@gmail.com](mailto:licketySplitAUS@gmail.com).

## Proposed Windows signing process

Subject to Foundation approval, Windows signing will use reviewed source from
this public repository and verified GitHub-hosted builds. Each release signing
request will require manual approval by the maintainer, if SignPath accepts
that role arrangement. Account MFA and the final role configuration must be
confirmed before enabling signing.

Publication of a signed Windows release will be conditional on successful
signature verification and updater-integrity checks. Signing failures must not
silently produce an unsigned release advertised as signed. Third-party
components retain their own provenance and licenses.

The final provider acknowledgement, approved roles and signing details will be
published here and linked from release pages once the service is approved and
configured. macOS signing and notarization are separate work.

See the [preparation plan](docs/SIGNPATH-PREPARATION.md) for outstanding questions
and the [privacy information](PRIVACY.md) for the application's network behaviour.
