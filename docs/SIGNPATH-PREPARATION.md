# SignPath preparation — draft, not an active signing policy

Prepared 17 October 2026. No application has been submitted, no terms accepted,
and no signing integration has been enabled. Review this document before using
its application text. Approval remains at the Foundation's discretion.

## Current readiness

| Item | Finding / next action |
| --- | --- |
| Repository | Public: https://github.com/licketySplitAUS/BabbleExpert (checked through the public GitHub API). |
| Existing distribution | Public v3.2.0 release has Windows EXE, Mac DMG and updater assets: https://github.com/licketySplitAUS/BabbleExpert/releases/tag/v3.2.0. |
| Builds | `.github/workflows/build.yml` tests and builds on GitHub-hosted runners using `npm ci`. This is not a claim of bit-for-bit reproducibility. |
| License | Owner approved MIT. Root LICENSE and package/lockfile metadata use MIT, and the build file list includes LICENSE. Review third-party dependency notices separately. |
| Contact | Lickety Split (alias; GitHub: licketySplitAUS), licketySplitAUS@gmail.com. Owner approved this email for the application and public security/privacy contact. Never put tokens or other private account details in this document. |
| Account setup | Requires owner participation after approval; no SignPath organization, project, policy or credentials have been verified. |

`private: true` in package.json prevents accidental npm publication; it does not
mean the GitHub repository is private and need not be removed for this purpose.

## Application draft

- Project name: Babble Expert
- Maintainer: Lickety Split (alias; GitHub: licketySplitAUS)
- Contact email: licketySplitAUS@gmail.com (also approved for public security/privacy contact)
- Repository: https://github.com/licketySplitAUS/BabbleExpert
- Downloads: https://github.com/licketySplitAUS/BabbleExpert/releases
- License: MIT
- Requested platform: Windows desktop application and NSIS installer

Suggested description:

> Babble Expert is a free desktop companion for players of the Babble word game.
> It displays PlayBabble beside either Lickety's Clues or Self Serve Clues, offers
> the floating Lickety Add word-entry box, and transfers found words between the
> game and clue pages. This repository contains the Electron desktop application,
> its build configuration and automated tests. Windows and macOS installers are
> distributed through GitHub Releases. We are requesting signing for our Windows
> application executable and installer built through GitHub Actions.

Do not describe the project as Foundation-approved or the current downloads as
signed. Confirm third-party game/clue content is distinguished from this app's
own source and distribution rights.

## Foundation conditions to resolve

The [published terms](https://signpath.org/terms.html) require an approved OSS
license, MFA, defined author/reviewer/approver roles and manual approval of each
release signing request. Publish signing/privacy policies and the required
acknowledgement on the project and download pages after acceptance. Confirm how
a sole maintainer can fulfil the roles. A CODE_OF_CONDUCT or SECURITY file does
not replace these requirements.

Privacy needs special attention: the terms describe installation-time disclosure
and an option to disable data transfers. Expert currently asks for usage-sharing
consent on first run, not in its one-click installer. Ask whether that is
acceptable; otherwise implement the agreed installer disclosure/control before
claiming compliance. Never use a blanket “no data is transferred” statement.

## Privacy documentation scope

Document the actual app behaviour and verify the server side before publishing:

- Usage sharing defaults to no reporting until consent. Options can disable it.
- With consent, the app sends a random installation ID, app version, platform,
  approximate country, install/upgrade events, menu selections and session time
  to `https://selfserve.r46.me/api/babble-notify`, which forwards notifications
  to Discord. Entered words and chat are not part of those notifications.
- Specify server/provider logging, retention, deletion contact and third-party
  privacy links after checking them; these have not been audited here.
- PlayBabble, the selected clue site, GitHub updates and external resources make
  their own network requests. Distinguish this ordinary functionality from
  optional usage reporting. Disabling usage sharing does not make Expert offline.

## Integration plan after approval

Keep the working unsigned release workflow unchanged until signing is configured
and tested. Do not add placeholder credentials to production jobs.

1. Set up the SignPath project, verified GitHub source and narrowly scoped
   artifact rules with SignPath. Install its GitHub integration as instructed.
2. Store the submitter token only in a GitHub Actions secret named
   `SIGNPATH_API_TOKEN`; never paste it in chat, source, logs or this document.
   Store organization/project/policy identifiers separately as repository variables.
3. Design and test signing of the app EXE before packaging, then the final NSIS
   installer. Confirm uninstaller handling and Electron runtime/third-party
   component treatment with SignPath. Signing the outer installer alone does
   not sign the executable inside it. Do not assume NSIS has deep-signing support.
4. Integrate the two signing stages with electron-builder's packaging lifecycle.
   Generate updater SHA-512 hashes, sizes and blockmaps from the FINAL signed
   installer. Signing an EXE after `latest.yml` and its blockmap were generated
   changes its bytes and can invalidate automatic updates.
5. Gate publication on successful signing and verification. Do not merge every
   downloaded artifact into release assets: an unsigned intermediate must never
   overwrite or be published beside the intended final installer by accident.
6. On a Windows CI runner, verify Authenticode status, certificate identity and
   product/version metadata. Test install, launch, uninstall and a real update
   from the previous unsigned release, including publisher-verification behaviour.
   Check updater metadata against the actual downloadable signed bytes.
7. Publish only the verified signed Windows installer and matching updater
   assets. Mac distribution stays separate: this work does not provide Apple
   Developer signing or notarization. Do not promise elimination of all OS
   reputation warnings merely because an executable has a valid signature.

### Current action interface — illustrative only

The [official GitHub integration documentation](https://docs.signpath.io/trusted-build-systems/github)
uses v3, an uploaded artifact ID and an output directory, not `artifact-path`
or `output-artifact-path`. This example is one signing stage, NOT a complete
Electron/NSIS pipeline. Agree the matching ZIP artifact configuration first.
Before production use, resolve reviewed action revisions to immutable commits.

```yaml
# Inside an approved GitHub-hosted job, after building the relevant unsigned EXE:
# Job permissions: { actions: read, contents: read }
- name: Upload unsigned input
  id: unsigned-input
  uses: actions/upload-artifact@v4
  with:
    name: unsigned-signing-input
    path: signing-input/*.exe
    if-no-files-found: error

- name: Request signing and retrieve result
  uses: signpath/github-action-submit-signing-request@v3
  with:
    api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
    organization-id: ${{ vars.SIGNPATH_ORGANIZATION_ID }}
    project-slug: ${{ vars.SIGNPATH_PROJECT_SLUG }}
    signing-policy-slug: ${{ vars.SIGNPATH_SIGNING_POLICY_SLUG }}
    github-artifact-id: ${{ steps.unsigned-input.outputs.artifact-id }}
    wait-for-completion: true
    wait-for-completion-timeout-in-seconds: 3600
    output-artifact-directory: signed-output
```

Use unique artifact names for the app and installer stages. Allow job time for
human approval as well as packaging; the timeout above is a planning example.
An unavailable signing service or missing approval should stop a signed release,
not silently publish unsigned files.

## Owner decisions before the next changes

1. Completed: owner approved MIT and confirmed permission to license the
   included code and assets. The license and metadata have been added locally.
2. Completed: use Lickety Split as the maintainer alias and
   licketySplitAUS@gmail.com for the application and public security/privacy contact.
3. Review third-party notices before distribution; dependencies keep their own
   licenses and externally loaded website content is not relicensed by Expert.
4. Review final policy text and personally authorize account terms/application.

Public SECURITY.md, PRIVACY.md and CODE_SIGNING.md now describe the reporting
contact, known data flows, outstanding privacy questions and proposed signing
process. They are linked from README; they do not claim approval or compliance.
Review required notices in packaged distributions and link the final approved
policy from future release/download pages.

## Additional application note

Suggested text if the form allows comments:

> The project is maintained by Lickety Split (GitHub: licketySplitAUS). Please
> advise whether a sole maintainer may fulfil the author, reviewer and manual
> signing-approver roles. Usage reporting is disabled until an explicit first-run
> opt-in and can be disabled in Options. The present one-click installer does
> not show the privacy policy or a telemetry option; please confirm whether the
> first-run consent approach is acceptable or what installer changes are needed.
> We will complete MFA verification, third-party notice review and the agreed
> signing/privacy requirements before enabling signed releases.
