"""Fetch citation candidates from Europe PMC; results require editorial selection.

使用公開書目 API，僅儲存至指定暫存目錄，不將未審閱摘要納入正式知識庫。
"""
import argparse
import concurrent.futures
import datetime
import json
import pathlib
import time
import urllib.parse
import urllib.request

QUERIES = {
    "kinematics": '(TITLE_ABS:"inertial" AND TITLE_ABS:"lower limb" AND (TITLE_ABS:"validity" OR TITLE_ABS:"review"))',
    "calibration": '(TITLE_ABS:"inertial" AND (TITLE_ABS:"sensor-to-segment" OR TITLE_ABS:"functional calibration"))',
    "hinge": '(TITLE_ABS:"inertial" AND (TITLE_ABS:"hinge" OR TITLE_ABS:"magnetometer-free" OR TITLE_ABS:"joint axis"))',
    "fusion": '(TITLE_ABS:"inertial" AND (TITLE_ABS:"sensor fusion" OR TITLE_ABS:"orientation estimation") AND (TITLE_ABS:"human" OR TITLE_ABS:"wearable"))',
    "artifact": '(TITLE_ABS:"inertial" AND (TITLE_ABS:"soft tissue" OR TITLE_ABS:"sensor placement" OR TITLE_ABS:"repeatability"))',
    "gait": '(TITLE_ABS:"inertial" AND TITLE_ABS:"gait" AND (TITLE_ABS:"systematic review" OR TITLE_ABS:"validation"))',
    "feedback": '(TITLE_ABS:"wearable" AND TITLE_ABS:"biofeedback" AND (TITLE_ABS:"rehabilitation" OR TITLE_ABS:"knee"))',
    "remote": '(TITLE_ABS:"telerehabilitation" AND (TITLE_ABS:"knee" OR TITLE_ABS:"arthroplasty") AND (TITLE_ABS:"randomized" OR TITLE_ABS:"review"))',
    "knee": '(TITLE_ABS:"inertial" AND (TITLE_ABS:"knee osteoarthritis" OR TITLE_ABS:"knee arthroplasty" OR TITLE_ABS:"anterior cruciate"))',
    "exercise": '((TITLE_ABS:"inertial" OR TITLE_ABS:"wearable") AND TITLE_ABS:"rehabilitation" AND (TITLE_ABS:"exercise recognition" OR TITLE_ABS:"exercise classification" OR TITLE_ABS:"movement quality"))',
    "usability": '(TITLE_ABS:"wearable" AND TITLE_ABS:"rehabilitation" AND (TITLE_ABS:"usability" OR TITLE_ABS:"acceptability" OR TITLE_ABS:"adherence"))',
    "measurement": '(TITLE:"Bland" OR TITLE:"intraclass correlation" OR TITLE:"minimal detectable change" OR TITLE:"COSMIN" OR TITLE:"PRISMA 2020" OR TITLE:"CONSORT 2010")',
    "anatomy": '(TITLE_ABS:"joint coordinate system" AND (TITLE_ABS:"knee" OR TITLE_ABS:"ISB"))',
}


def fetch(key, query, cutoff, directory, sort_cited=False):
    """依查詢保存 API 證據與擷取日期，重試有限次數以避免過度請求。"""
    final = f'{query} AND SRC:MED AND HAS_ABSTRACT:Y AND FIRST_PDATE:[1900-01-01 TO {cutoff}] NOT PUB_TYPE:"Preprint" NOT TITLE:"Erratum" NOT TITLE:"Correction" NOT PUB_TYPE:"Retracted Publication"'
    if sort_cited:
        final += " sort_cited:y"
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + urllib.parse.urlencode({
        "query": final, "format": "json", "resultType": "core", "pageSize": 22,
    })
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "IRMS-Knowledge-Curation/1.0"})
            with urllib.request.urlopen(req, timeout=45) as response:
                data = json.load(response)
            payload = {"category": key, "query": final, "url": url,
                       "retrieved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "response": data}
            (directory / f"{key}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            return key, data["hitCount"], len(data["resultList"]["result"])
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def main():
    """以最多兩條連線擷取候選，保留可重現查詢。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--cutoff", default="2026-10-03")
    parser.add_argument("--sort-cited", action="store_true", help="優先擷取經典來源；引用次數不是品質評分")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(fetch, key, query, args.cutoff, args.output, args.sort_cited) for key, query in QUERIES.items()]
        for future in concurrent.futures.as_completed(futures):
            print(*future.result(), flush=True)


if __name__ == "__main__":
    main()
