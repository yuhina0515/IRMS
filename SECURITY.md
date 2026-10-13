# Security Policy

## Supported versions

IRMS is in pre-release (`v1.2.0-beta.x`). Only the latest published release receives security fixes.

| Version | Supported |
| ------- | --------- |
| Latest `v1.2.0-beta.x` release | Yes |
| Older releases | No |

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**. Do not open a public issue or pull request for them.

Use GitHub's private reporting: go to the **Security** tab of this repository and choose **Report a vulnerability**.

Please include:

- Affected component (app, firmware, module system, telemetry service) and version.
- Steps to reproduce, or a minimal proof of concept.
- The impact you expect (for example data exposure, unauthorized firmware or module install, signature bypass).

## What to expect

- Acknowledgement within 7 days.
- An initial assessment within 14 days.
- A fix or mitigation in the next release for confirmed issues, with credit to the reporter unless you prefer to stay anonymous.

This is a small, student-run project, so these are best-effort targets rather than guarantees.

## Scope

In scope:

- The IRMS desktop app, including the update and module-loading paths.
- Signature verification for OTA firmware and runtime modules.
- The telemetry collector endpoints documented in this repository.

Out of scope:

- Findings that require physical access to a device you do not own.
- Denial-of-service through excessive traffic or resource exhaustion.
- Social engineering, and testing against systems or accounts that are not yours.
- Vulnerabilities in third-party dependencies with no demonstrated impact on IRMS (report those upstream).

## Safe harbor

Good-faith research that follows this policy, avoids privacy violations and service disruption, and stays within the scope above will not be pursued by the maintainers. Test only against your own devices and installations.

## Licensing note

This repository is source-available under the IRMS Source-Available License. Reporting a vulnerability does not grant any license or patent right beyond that license.
