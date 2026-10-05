# iOS unsigned IPA via GitHub Actions (free Apple ID route)

## Request
Research an iOS dev environment, then (user decision) take the free route on Windows: no US$99 Apple Developer Program, no Mac. Constraint: Xcode only runs on macOS, so the build must happen on a GitHub-hosted macOS runner (repo is public, so free).

## Actions
- Branch `feat/ios-unsigned-ipa` (from origin/feat/calibration-b = beta.24), worktree `_repo-migration/ios-wt`.
- `.github/workflows/ios-unsigned.yml`: macos-latest, `tauri ios init`, patch generated pbxproj to disable code signing, `tauri ios build --target aarch64`, hand-package the `.app` into `IRMS_unsigned.ipa`, upload artifact `IRMS-unsigned-ipa`.
- `src-tauri/Info.ios.plist`: `NSBluetoothAlwaysUsageDescription`.
- `src-tauri/tauri.ios.conf.json`: link `CoreBluetooth` (btleplug needs it; first link failed with undefined `_CB*` symbols).

## Decisions
- Unsigned IPA + Sideloadly/AltStore resign on Windows. Free Apple ID => 7-day expiry, max 3 sideloaded apps; paid account needed for TestFlight/App Store.
- `tauri ios build` export step is expected to fail ("No Team Found in Archive"); the workflow ignores it and packages the built `.app` from DerivedData `Products/release-iphoneos`.
- Trigger is `push` limited to the workflow file path on this branch, because `workflow_dispatch` only works once the file is on the default branch.

## Verification
- Run 37295743823: BUILD SUCCEEDED, IPA 4.5 MB downloaded and inspected: arm64 Mach-O, bundle id com.irms.app.tauri, MinimumOSVersion 14.0, Bluetooth usage string present, no _CodeSignature.
- NOT verified: install on a real iPhone, BLE on iOS, app launch. No device test was possible from this session.

## Self-review
Failure scenario: a silently empty IPA (first run produced a 544-byte IPA because `find` matched the wrong thing while the build had actually failed). Added checks: `Info.plist` must exist and IPA must exceed 1 MB; second run passed them and the IPA was inspected by hand.

## Resume state
- Next: user installs Sideloadly from sideloadly.io (winget package hash mismatch, not bypassed), plugs in iPhone 16 (Developer Mode on), signs with a free Apple ID, installs `ios-out/IRMS_unsigned.ipa`, then reports launch/BLE results.
- Open: iTunes folder exists but "Apple Mobile Device Service" was not found; USB driver may need the non-Store iTunes reinstall.
- Open: merge decision for the branch; app code has no iOS-specific UI/permission-flow checks yet.
