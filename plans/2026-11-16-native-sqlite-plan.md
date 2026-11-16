# Native SQLite takeover

Finish and verify the interrupted native session persistence slice on plan/rust-native-ui. Baseline 62cf7f7, five modified files and untracked store.rs. Snapshot at %TEMP%\irms-squad-7c263b26. Only the lead edits. Stay on the prototype, use isolated databases and simulation, and leave hardware acceptance open.

| ID | Model | Scope | Focus |
|---|---|---|---|
| A | inherited | store.rs and core DB | persistence failures and recovery |
| B | inherited | main.rs BLE timer and judge | sample integrity and gaps |
| C | inherited | Slint and main.rs callbacks | session lifecycle and history |

Reports use snapshot file:line, severity, failing scenario and fix, within 400 words. Done when verified defects are addressed or explicitly deferred, regression checks and reopen acceptance run, and findings are indexed in the project log.
