---
tags: [irms, native, modules, publishing]
date: 2026-11-22
summary: Proposed IRMS-Modules change so scripts/build-index.mjs can publish native content packs (session tips) in the signed index. Not applied.
---

# Publishing native content packs from IRMS-Modules (proposal, not applied)

The native app reads the same signed `index.json` as the Tauri app. Native packs are an extra top-level
`native` array; the Tauri parser ignores unknown fields, and the signature covers the whole file.

```json
{ "schema": 1, "modules": [ ... ],
  "native": [{
    "id": "session-tips", "version": "1.0.0", "name": "使用提示", "description": "",
    "kind": "content", "schemaVersion": 1, "minApp": "1.3.0-beta.12",
    "sha256": "<sha256 over the files' bytes in listed order>",
    "url": "https://github.com/yuhina0515/IRMS-Modules/releases/download/v2026.11.22/",
    "files": [{ "name": "session-tips-1.0.0-tips.json", "path": "tips.json", "size": 123, "sha256": "<hex>" }]
  }] }
```

Proposed repo changes:

1. Source layout `native/<id>/pack.json` (id, version, name, schemaVersion, minApp) next to the content
   files (`native/session-tips/tips.json`, `{ "schema_version": 1, "tips": ["..."] }`).
2. `scripts/build-index.mjs`: for each `native/<id>`, copy each file to `dist/<id>-<version>-<path>`,
   hash it, compute the package digest, and emit the entry above. `url` uses the release tag being built
   (the workflow already runs on `vYYYY.MM.DD` tags; pass it as `GITHUB_REF_NAME`). Same id/semver
   regexes as the JS modules; refuse unknown file names.
3. `tests/`: a test that the generated `native` entries satisfy the rules in
   `IRMS_Core/src/modules.rs::validate_entry` (id, semver, file names `[A-Za-z0-9._-]`, size <= 256 KiB).
4. No workflow change: `gh release create ... dist/*` already uploads the new assets, and the app reads
   `releases/latest/download/index.json(.sig)`.

Caveat: `latest/download` follows GitHub's latest release, so a tag that contains only JS module changes
still carries the full index, including the native packs; keep every tag's index complete.
