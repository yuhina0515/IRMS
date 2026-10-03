"""Search reviewed IRMS references in Chinese or English without extra packages."""
import argparse
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]


def search(query, topic=None, core=False):
    """中文使用子字串，避免只依英語全文斷詞而漏掉繁體中文摘要。"""
    catalog = json.loads((ROOT / "data/catalog.json").read_text(encoding="utf-8"))
    topics = json.loads((ROOT / "data/topics.json").read_text(encoding="utf-8"))
    labels = {t["id"]: t["name"] for t in topics}
    if topic and topic not in labels:
        raise ValueError("Unknown topic: " + topic)
    terms = query.casefold().split()
    results = []
    for s in catalog["sources"]:
        if topic and topic not in s["topics"] or core and s["priority"] != "core":
            continue
        text = " ".join([s["id"], s["title"], " ".join(s["authors"]), s.get("doi", ""),
                         s["summary_zh"], s["irms_application"], s["limitations_zh"], " ".join(labels[t] for t in s["topics"])]).casefold()
        if all(term in text for term in terms):
            results.append(s)
    return sorted(results, key=lambda s: (s["priority"] != "core", -(s.get("year") or 0), s["id"]))


def main():
    """輸出每筆來源時一併保留限制與閱讀深度，便於人工或 AI 參考。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", nargs="?", default="")
    parser.add_argument("--topic")
    parser.add_argument("--core", action="store_true")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    try:
        results = search(args.query, args.topic, args.core)
    except ValueError as error:
        parser.error(str(error))
    if args.json:
        print(json.dumps({"count": len(results), "results": results[:args.limit]}, ensure_ascii=False, indent=2))
    else:
        print(f"Matched {len(results)}; showing {min(len(results), args.limit)}")
        for s in results[:args.limit]:
            print(f"\n{s['id']} | {s['title']}\n{s['summary_zh']}\nIRMS: {s['irms_application']}\nLimit: {s['limitations_zh']}\nReview: {s['review_level']} | {s['url']}")


if __name__ == "__main__":
    main()
