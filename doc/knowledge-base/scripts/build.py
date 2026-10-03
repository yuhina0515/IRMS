"""Build the offline IRMS reference library from the reviewed JSON catalog.

來源 JSON 是唯一編輯入口；產生卡片、主題索引、引用與本地 SQLite，避免版本分歧。
"""
import argparse
import collections
import json
import pathlib
import re
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[1]


def load_catalog(root=ROOT):
    """檢查來源身分、日期與必要欄位，防止未審閱候選進入正式輸出。"""
    catalog = json.loads((root / "data/catalog.json").read_text(encoding="utf-8"))
    topics = json.loads((root / "data/topics.json").read_text(encoding="utf-8"))
    known_topics = {t["id"] for t in topics}
    seen_ids, seen_dois, seen_pmids = set(), set(), set()
    required = ["id", "title", "authors", "url", "topics", "summary_zh", "irms_application", "limitations_zh", "review_level", "verification", "provenance", "rights_note"]
    for s in catalog["sources"]:
        if any(not s.get(key) for key in required):
            raise ValueError(f"Missing reviewed fields: {s.get('id')}")
        if any(not a.strip() for a in s['authors']) or any(not a.strip() for a in s.get('bibtex_authors', [])):
            raise ValueError(f"Empty author: {s.get('id')}")
        if s['review_level'] not in {'abstract', 'full-text-sections', 'primary-page-excerpt', 'metadata-only'}:
            raise ValueError(f"Unknown review depth: {s.get('id')}")
        if not re.fullmatch(r"[A-Z0-9-]+", s["id"]) or s["id"] in seen_ids:
            raise ValueError(f"Invalid or duplicate id: {s['id']}")
        seen_ids.add(s["id"])
        for key, seen in [("doi", seen_dois), ("pmid", seen_pmids)]:
            value = s.get(key, "").lower()
            if value and value in seen:
                raise ValueError(f"Duplicate {key}: {value}")
            if value:
                seen.add(value)
        if s.get("doi") and not re.fullmatch(r"10\.\d{4,9}/\S+", s["doi"], re.I):
            raise ValueError(f"Invalid DOI: {s['id']}")
        if not s["url"].startswith("https://") or not set(s["topics"]) <= known_topics:
            raise ValueError(f"Invalid URL/topic: {s['id']}")
        if s.get("first_publication_date") and s["first_publication_date"] > catalog["snapshot_date"]:
            raise ValueError(f"Publication after cutoff: {s['id']}")
        if s["verification"]["status"] == "pending-fetch":
            raise ValueError(f"Unverified candidate: {s['id']}")
    repo = root.parents[1]
    for t in topics:
        if not any(t["id"] in s["topics"] for s in catalog["sources"]):
            raise ValueError(f"Empty topic: {t['id']}")
        for path in t["code_paths"]:
            if not (repo / path).exists():
                raise ValueError(f"Stale code mapping: {path}")
    return catalog, topics


def citation(s):
    """來源引用文字僅使用已取得的書目欄位，不推測未知年代。"""
    authors = ", ".join(s["authors"][:3]) + (", et al." if len(s["authors"]) > 3 else "")
    parts = [authors, str(s.get("year") or "n.d."), s["title"].rstrip("."), s.get("journal"), s.get("volume")]
    parts = [p for p in parts if p]
    if s.get("pages"):
        parts.append(s["pages"])
    parts.append("https://doi.org/" + s["doi"] if s.get("doi") else s["url"])
    return ". ".join(parts) + "."


def bib_escape(value):
    """保留 UTF-8 名稱並避免書目欄位破壞 BibTeX 括號。"""
    return str(value).replace("\\", r"\textbackslash{} ").replace("{", r"\{").replace("}", r"\}").replace("&", r"\&").replace("%", r"\%").replace("_", r"\_").replace("#", r"\#")


def bibtex(s, date):
    """個人作者以姓、名寫出，機構作者以額外括號保護。"""
    kind = "article" if s["source_type"] == "publication" else "techreport" if s["source_type"] == "technical-report" else "misc"
    fields = {"title": "{" + bib_escape(s["title"]) + "}", "url": s["url"], "urldate": date}
    names = s.get("bibtex_authors")
    corporate = set(s.get('corporate_authors', []))
    fields["author"] = " and ".join("{" + bib_escape(n) + "}" if n in corporate else bib_escape(n) for n in names) if names else " and ".join("{" + bib_escape(n) + "}" for n in s["authors"])
    for key, source_key in [("year", "year"), ("journal", "journal"), ("volume", "volume"), ("number", "issue"), ("pages", "pages"), ("doi", "doi")]:
        if s.get(source_key):
            fields[key] = bib_escape(s[source_key])
    return "@" + kind + "{" + s["id"] + ",\n" + ",\n".join(f"  {key} = {{{value}}}" for key, value in fields.items()) + "\n}\n"


def write(path, value):
    """固定 UTF-8 與 LF，確保重建可比較。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as output:
        output.write(value)


def build_sqlite(root, sources, topics):
    """由 catalog 重建本地搜尋資料庫，不讀取或修改 IRMS 的使用者資料庫。"""
    path = root / "irms-knowledge.sqlite"
    with sqlite3.connect(path) as db:
        db.executescript("""
            DROP TABLE IF EXISTS sources_fts;
            DROP TABLE IF EXISTS source_topics;
            DROP TABLE IF EXISTS sources;
            DROP TABLE IF EXISTS topics;
            CREATE TABLE sources (id TEXT PRIMARY KEY, title TEXT NOT NULL, year INTEGER, doi TEXT,
                source_type TEXT, review_level TEXT, priority TEXT, summary_zh TEXT, irms_application TEXT,
                limitations_zh TEXT, url TEXT, record_json TEXT NOT NULL);
            CREATE TABLE topics (id TEXT PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE source_topics (source_id TEXT REFERENCES sources(id), topic_id TEXT REFERENCES topics(id),
                PRIMARY KEY (source_id, topic_id));
            CREATE VIRTUAL TABLE sources_fts USING fts5(id UNINDEXED, title, summary_zh, irms_application,
                limitations_zh, tokenize='unicode61');
        """)
        db.execute("PRAGMA foreign_keys=ON")
        db.executemany("INSERT INTO topics VALUES (?,?)", [(t["id"], t["name"]) for t in topics])
        for s in sources:
            db.execute("INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", tuple(s.get(k) for k in ["id", "title", "year", "doi", "source_type", "review_level", "priority", "summary_zh", "irms_application", "limitations_zh", "url"]) + (json.dumps(s, ensure_ascii=False),))
            db.executemany("INSERT INTO source_topics VALUES (?,?)", [(s["id"], t) for t in s["topics"]])
            db.execute("INSERT INTO sources_fts VALUES (?,?,?,?,?)", tuple(s[k] for k in ["id", "title", "summary_zh", "irms_application", "limitations_zh"]))
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("SQLite integrity validation failed")
    return path


def build(root=ROOT, sqlite=True):
    """從唯一資料來源產生可閱讀與可檢索格式，維持出處及限制同時存在。"""
    catalog, topics = load_catalog(root)
    sources, date = catalog["sources"], catalog["snapshot_date"]
    labels = {t["id"]: t["name"] for t in topics}
    stats = {"source_count": len(sources), "topic_count": len(topics), "snapshot_date": date,
             "source_types": dict(collections.Counter(s["source_type"] for s in sources)),
             "review_levels": dict(collections.Counter(s["review_level"] for s in sources)),
             "doi_count": sum(bool(s.get("doi")) for s in sources),
             "core_count": sum(s["priority"] == "core" for s in sources)}
    write(root / "data/stats.json", json.dumps(stats, ensure_ascii=False, indent=2) + "\n")
    index = ["# IRMS 來源總索引", "", f"{len(sources)} 筆來源，{len(topics)} 個主題；快照 {date}。主題間有交叉索引，同一來源只計一次。", "", "[使用說明](README.md) · [離線搜尋](index.html) · [引用主張](CLAIMS.md) · [驗證計畫](VALIDATION_PLAN.md)", ""]
    retrieval, ris = [], []
    for s in sources:
        links = " · ".join(f"[{labels[t]}](../topics/{t}.md)" for t in s["topics"])
        card = ["---", "tags: [irms, knowledge, reference]", f"source_id: {s['id']}", f"date: {date}", "---", "", "# " + s["title"], "", links, "", "## 書目與原始來源", "", citation(s), "", f"- 原始入口：[來源]({s['url']})", f"- 類型：`{s['source_type']}`；研究形式：`{s['study_type']}`", f"- 閱讀深度：`{s['review_level']}`；查核：`{s['verification']['status']}`", f"- 證據定位：{s['evidence_locator']}", "", "## 重點", "", s["summary_zh"], "", "## IRMS 用途", "", s["irms_application"], "", "## 適用限制", "", s["limitations_zh"], "", "研究族群、樣本數、效應量、完整實驗設定與偏誤風險未全面擷取；正式報告採用數值前須核對原文。", "", "## 追溯與版權", "", f"資料取得／檢查日：{s['verification']['checked_on']}。來源記錄：[出處]({s['provenance']['record_url']})。", "", s["rights_note"], "", "[知識庫首頁](../README.md) · [完整機器可讀資料](../data/catalog.json)", ""]
        if s["verification"].get("catalog_url"):
            card.insert(-3, f"官方目錄：[文件身分]({s['verification']['catalog_url']})。直接文件本次未取得。\n")
        write(root / "sources" / (s["id"] + ".md"), "\n".join(card))
        retrieval.append({"id": s["id"], "title": s["title"], "topics": s["topics"], "url": s["url"], "doi": s.get("doi"), "review_level": s["review_level"], "verification_status": s["verification"]["status"], "snapshot_date": date,
                          "text": "\n".join([citation(s), "重點：" + s["summary_zh"], "IRMS 用途：" + s["irms_application"], "限制：" + s["limitations_zh"], "閱讀深度：" + s["review_level"], "來源不能直接證明 IRMS 的準確度、診斷能力或療效。"])} )
        entry = ["TY  - " + ("JOUR" if s["source_type"] == "publication" else "RPRT" if s["source_type"] == "technical-report" else "ELEC"), "ID  - " + s["id"], "TI  - " + s["title"]]
        entry.extend("AU  - " + a for a in s.get("bibtex_authors", s["authors"]))
        for tag, key in [("PY", "year"), ("JO", "journal"), ("VL", "volume"), ("IS", "issue"), ("DO", "doi"), ("UR", "url")]:
            if s.get(key):
                entry.append(f"{tag}  - {s[key]}")
        if s.get('pages'):
            pages = re.fullmatch(r'([^\s-]+)[-–]([^\s-]+)', s['pages'])
            entry.append('SP  - ' + (pages[1] if pages else s['pages']))
            if pages:
                entry.append('EP  - ' + pages[2])
        entry.extend(["Y2  - " + date, "ER  -", ""])
        ris.append("\n".join(entry))
    for t in topics:
        entries = [s for s in sources if t["id"] in s["topics"]]
        body = ["# " + t["name"], "", t["question"], "", f"本主題 {len(entries)} 筆交叉索引。", "", "## 專案對照", ""]
        body += [f"- [{p}](../../../{p})" for p in t["code_paths"]]
        body += ["", "## 來源導讀", "", "優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。", ""]
        index += ["## " + t["name"], "", f"[主題導讀](topics/{t['id']}.md)：{t['question']}", ""]
        for s in sorted(entries, key=lambda x: (x["priority"] != "core", -(x.get("year") or 0), x["id"])):
            line = f"- **{s['id']}** [{s['title']}](../sources/{s['id']}.md) ({s.get('year') or '持續文件'}；{s['review_level']}) — {s['summary_zh']}"
            body.append(line)
            index.append(line.replace("../sources/", "sources/"))
        body += ["", "[首頁](../README.md) · [引用主張](../CLAIMS.md)", ""]
        write(root / "topics" / (t["id"] + ".md"), "\n".join(body))
        index.append("")
    write(root / "INDEX.md", "\n".join(index))
    write(root / "references.bib", "\n".join(bibtex(s, date) for s in sources))
    write(root / "references.ris", "\n".join(ris))
    write(root / "data/retrieval.jsonl", "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in retrieval))
    template = (root / "templates/index.html").read_text(encoding="utf-8")
    # JSON 的小於號以 Unicode 轉義，避免資料終止 script 元素。
    output = template.replace("__CATALOG__", json.dumps(catalog, ensure_ascii=False).replace("<", "\\u003c"))
    output = output.replace("__TOPICS__", json.dumps(topics, ensure_ascii=False).replace("<", "\\u003c"))
    output = output.replace("__SOURCE_COUNT__", str(len(sources))).replace("__SNAPSHOT__", date)
    write(root / "index.html", output)
    if sqlite:
        build_sqlite(root, sources, topics)
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-sqlite", action="store_true")
    build(sqlite=not parser.parse_args().no_sqlite)
