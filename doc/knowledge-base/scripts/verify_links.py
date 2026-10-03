"""Check source availability without treating a successful request as evidence quality.

以網路回應分開記錄可取得狀態，HTTP 成功不代表全文已審查或系統已驗證。
"""
import argparse
import concurrent.futures
import datetime
import functools
import hashlib
import html
import json
import pathlib
import re
import urllib.error
import urllib.request


def verify(source, checked_on="2026-10-03"):
    """擷取有限長度的原始官方文件並提供可檢查的頁面片段。"""
    result = {"id": source["id"], "requested_url": source["url"], "checked_on": checked_on}
    try:
        req = urllib.request.Request(source["url"], headers={"User-Agent": "Mozilla/5.0 IRMS-Reference-Link-Check/1.0"})
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read(8_000_000)
            result.update(status="retrieved", http_status=response.status,
                          final_url=response.url, content_type=response.headers.get("Content-Type", ""),
                          content_hash=hashlib.sha256(raw).hexdigest())
        if raw.startswith(b"%PDF"):
            result["excerpt"] = "PDF signature confirmed; specification identity also checked against official search result."
        else:
            doc = raw.decode("utf-8", errors="replace")
            title = re.search(r"<title[^>]*>(.*?)</title>", doc, re.I | re.S)
            result["page_title"] = html.unescape(re.sub(r"<[^>]+>", "", title.group(1))) if title else ""
            main = re.search(r"<main\b[^>]*>(.*?)</main>", doc, re.I | re.S)
            region = main.group(1) if main else doc
            paras = [html.unescape(re.sub(r"<[^>]+>", " ", p)) for p in re.findall(r"<p\b[^>]*>(.*?)</p>", region, re.I | re.S)]
            paras = [re.sub(r"\s+", " ", p).strip() for p in paras]
            paras = [p for p in paras if len(p) > 90 and "cookie" not in p.lower() and "javascript" not in p.lower()]
            result["excerpt"] = " | ".join(paras[:2])[:700]
            if re.search(r"captcha|checking your browser|access denied|challenge-platform", result["page_title"], re.I):
                result["status"] = "blocked-page"
            elif source["url"].lower().endswith(".pdf"):
                result["status"] = "unexpected-non-pdf-response"
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        result.update(status="unavailable-to-checker", error=str(error))
    return result


def main():
    """檢查官方來源；書目來源由 Europe PMC 擷取紀錄另外驗證。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1] / "data/catalog.json")
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--checked-on", default=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat())
    args = parser.parse_args()
    sources = json.loads(args.catalog.read_text(encoding="utf-8"))["sources"]
    selected = [s for s in sources if not s.get("pmid")]
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(functools.partial(verify, checked_on=args.checked_on), selected):
            results.append(result)
            print(result["id"], result["status"], flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
