# History list page budget

The additive sessions.listPage(page,pageSize) / sessions_list_page path returns
{sessions,total,page,pageSize}. Native unsigned inputs reject malformed negative/fractional JSON;
requested size is clamped1..100, page is clamped against count before offset arithmetic. Empty
lists return total0,page0. COUNT and rows share one read transaction. Sorting is startTime DESC,
id DESC; migration10 adds nonunique idx_sessions_start_id only. Versions1..9 and existing rows
are preserved. Old list SQL/API, getReview, full getData and CSV remain available.

[Budget artifact](history-pages-budget-20261029.json) records exact serialized fixture SHA256 and
source/Cargo hashes. Reproduce from IRMS_App_Tauri:

```powershell
$env:CARGO_BUILD_JOBS='1'
cargo test --manifest-path src-tauri/Cargo.toml history_page_bounds_ties_and_full_availability -- --nocapture
```

The IRMS_HISTORY_PAGE_BUDGET line compares1,001 synthetic sessions (fixed same startTime): full
return345,240 bytes vs100-row page34,553 bytes, including page metadata. Tests traverse every ID
once across stable pages; cap, zero-size/extreme-page clamp, deletion/empty cases, migration9->10
row parity and EXPLAIN QUERY PLAN index/no temporary sort are covered. This is deterministic
in-memory return-size evidence, not latency/heap/FPS measurement. Existing history-review debug
WAL timings are historical evidence for a different workload and were not rerun here.

Renderer derives bounded pageSize from measured row capacity, identifies requests by page/size/
refresh, hides obsolete rows and ignores stale success/errors. Review hides page loading; return
refreshes the retained page. Deletion reloads current requested page; server-clamped page drives
navigation without an extra request. Pending controls and current failures are handled. Test-only
list fixtures can be adapted into pages; product code never falls back to unbounded list.

Limits: response cap counts rows, not bytes; calibration/action text can vary. COUNT and deep OFFSET
costs remain; distinct pages are different snapshots, so concurrent insertion/deletion can shift
OFFSET positions. No total CPU/heap budget or cross-page fixed dataset is claimed. New index costs
startup migration time/storage and write maintenance; actual large-install/paced native acceptance
requires named-environment measurement. Native reads already issued are not cancelled by UI cleanup.
