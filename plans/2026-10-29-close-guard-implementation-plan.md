# R05 healthy-renderer normal-close guard implementation

Baselinee1ad348 clean; prior source snapshot %TEMP%/irms-close-recovery-snapshot remains exact
for the unchanged runtime sources. Prior storage CI40873513567 SUCCESS; latest docs CI40874246554
must complete before push. Initial quota25%/60%, observed24%/60%. One bounded implementation task.
Assessment and alternatives: plans/2026-10-29-close-recovery-plan.md.

Decision: block-and-save, preserving existing explicit end/save/retry. No auto-end, discard, force
exit or new confirmation. Application-lifetime singleton main bootstrap disables start synchronously
until native close listener is installed. Registration failure keeps starts blocked and reports a
localized restart hint. Controller close reservation includes starting/ending/store running/id,
buffer/flushing; idle reservation prevents start until destruction or destruction failure release.
Handler always prevents default first, destroys only reserved idle window, catches native rejection.
Lifetime listener intentionally remains registered: no view/hook cleanup or late-unmount race exists.
Installed window.js destroys automatically after unprevented handler; explicit destroy avoids leaving
an unrecoverable closing gate after rejected native destroy. Installed ACL core:window:default lacks
allow-destroy; add only core:window:allow-destroy to existing main-window capability.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | inherited/backend unknown | final guard/controller/bootstrap/ACL diff | race, fail-closed registration, retained-save protection |
| Lead | current | implementation/tests/docs/delivery | no silent close loss, no native/force-exit claim |

Worker read-only/no edits/deploy/commit/heavytests/network/other chats, <=180words verified findings.
Tests actual production handler with native/controller boundary mocks plus real controller lifecycle:
idle/start reservation, pending native start before id, retained end failure, registration pending/
failure/idempotency, prevented busy close and rejected destruction recovery. Full frontend/typecheck/
build; no Rust source/schema changes. Native titlebar/AltF4, crashed/hung renderer, force kill/OS
shutdown and durable recovery remain unverified. Document/index/checkpoint then scoped commit/push/
draft PR after latest previous CI success. Stop/checkpoint if any known quota<=20%.
