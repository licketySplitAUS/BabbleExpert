# Babble Expert developer documentation

Start with [Desktop architecture and logic flows](ARCHITECTURE.md), then use the [cross-project developer guide](https://github.com/licketySplitAUS/SelfServeClues/blob/main/docs/DEVELOPER-GUIDE.md), [design principles](https://github.com/licketySplitAUS/SelfServeClues/blob/main/docs/DESIGN-PRINCIPLES.md) and [build/release handbook](https://github.com/licketySplitAUS/SelfServeClues/blob/main/docs/BUILD-AND-RELEASE.md) for the connected system. Those shared guides live in SelfServeClues to avoid maintaining three conflicting copies.

| Read this | Purpose |
| --- | --- |
| [Desktop architecture](ARCHITECTURE.md) | Process/view model, trust boundaries, submission/reconciliation, Resources, persistence and updater flows |
| [Root README](../README.md) | Player behaviour, development launch and feature overview |
| [Implementation reference](AGENT-REFERENCE.md) | Detailed contracts and focused test pointers |
| [Interactive preview tools](../tools/preview/README.md) | Isolated development profiles and layout previews |
| [Privacy](../PRIVACY.md) | Local data, usage consent, diagnostics and contact reporting |
| [Signing policy](../CODE_SIGNING.md) | Intentionally unsigned distribution |
| [Build workflow](../.github/workflows/build.yml) | Exact CI gates, native matrix and draft release creation |
| [Release notes](../RELEASE_NOTES.md) | Player-facing changes for the current source version |

Checked against source on 29 October 2026. These documents do not certify a deployed website or installed version. Dated plans describe decisions at that time; use current code and tests for present behaviour. Update the relevant guide when changing a bridge, state boundary, build step or failure path.
