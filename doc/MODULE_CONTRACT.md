# Runtime module contract

Product decision (2026-09-27): module management contains only status, versions, toggles,
metadata and links. All operation UI belongs to module-owned pages, hosted on the 工具 (Tools)
tab (beta.18); each page appears there as one selectable tool titled by `registerPage`'s `title`.

The authoritative authoring contract is
[IRMS-Modules/MODULE_CONTRACT.md](https://github.com/yuhina0515/IRMS-Modules/blob/main/MODULE_CONTRACT.md).
Revision 1 of the contract is in that file on `main`.

The host implements additive API v2 fields: `registerPage({ title, mount })`,
`onDispose(cleanup)` and `signal`. Explicit unknown contract versions fail activation;
legacy modules without a revision remain compatible. Legacy `registerPanel` is adapted
to a Tools page titled with the module name and never mounted in module management.

Registration closes after activation. Failed activation rolls back features and disposes
resources. Disable aborts the instance and removes its providers immediately; asynchronous
cleanup finishes before reactivation. Verified module entries are retained, so enabling
reimports/activates locally without resync or restart. Page cleanup is distinct from
instance disposal: navigation can preserve a share; disabling must end it.

New modules must declare and feature-detect required capabilities, provide cleanup for
background work, and pass the module repository's build-time contract validator. The
contract does not prescribe page layout, business workflows or optional extension fields.
Native privileges continue to be supplied explicitly by the host; modules are trusted
first-party code, not sandboxed JavaScript.

Rollout (rebased onto beta.18; current app is beta.19): beta.17/beta.18 shipped without these host changes, so
the companion live-share release is 1.0.2 with `minAppVersion` 1.2.0-beta.19; publish the
compatible app first. The `angleRange` capability and the angle-range module are retained;
angle-range is migrated to `registerPage` plus `contractVersion: 1` and `requires` metadata
in the companion module PR.
