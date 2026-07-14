# Project-specific override

This project (IRMS) maintains its own Obsidian-native work-log convention in
`doc/coding log/` (frontmatter: `tags`/`date`/`summary`; filename pattern
`log_YYYYMMDD_topic.md`), indexed by `doc/HOME.md` and auto-listed by
`doc/coding-logs.base`. This predates and supersedes the global CLAUDE.md
instruction to write `.claude/logs/*.md` for non-trivial tasks.

**Do NOT create `.claude/logs/*.md` entries for this project.** Write the
work log directly into `doc/coding log/` following the existing frontmatter
format instead. `.claude/logs` is a dot-folder Obsidian doesn't index by
default, so anything written only there is invisible to this project's
actual knowledge base and wikilinks pointing at it silently break.

(Decided 2026-07-14, pre-v1.0.0-release cleanup — see
`doc/coding log/log_20260714_doc_cleanup_and_release.md`.)
