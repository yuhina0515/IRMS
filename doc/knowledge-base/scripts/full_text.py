"""Join and render original, located full-text extractions without redistributing articles."""
import json
import re

FACTS = {'design': '研究設計', 'participants': '族群與樣本', 'equipment': '設備與取樣',
         'protocol': '實驗程序', 'reference': '參考系統', 'analysis': '分析方法'}


def join_reviews(root, catalog):
    """Validate extraction identity, locators and provenance before exporting any data."""
    data = json.loads((root / 'data/full-text-reviews.json').read_text(encoding='utf-8'))
    sources = {s['id']: s for s in catalog['sources']}
    seen = set()
    for r in data['reviews']:
        sid = r['id']
        if sid not in sources or sid in seen:
            raise ValueError('Unknown/duplicate full-text review: ' + sid)
        seen.add(sid)
        s = sources[sid]
        if s.get('full_text_review_id') != sid or s['review_level'] != 'full-text-extracted':
            raise ValueError('Review pointer/depth mismatch: ' + sid)
        a = r['access']
        if a['pmcid'] != s['pmcid'] or a['retrieved_on'] != data['reviewed_on'] or not re.fullmatch('[a-f0-9]{64}', a['sha256']):
            raise ValueError('Review provenance mismatch: ' + sid)
        if not a['xml_url'].startswith('https://') or not a['full_text_url'].startswith('https://'):
            raise ValueError('Unsafe full-text URL: ' + sid)
        if not r['results'] or not r['limitations'] or not r['irms_implications']:
            raise ValueError('Incomplete extraction: ' + sid)
        for f in [r[k] for k in FACTS] + r['results'] + r['limitations']:
            if not f.get('text') or not f.get('locator'):
                raise ValueError('Missing fact/locator: ' + sid)
        if any(f['origin'] not in {'author', 'reviewer-inference'} for f in r['limitations']):
            raise ValueError('Unlabelled limitation: ' + sid)
        s['full_text_review'] = r
    if seen != {s['id'] for s in sources.values() if s['review_level'] == 'full-text-extracted'}:
        raise ValueError('Missing extraction for reviewed source')
    catalog['review_update_date'] = data['reviewed_on']
    return data


def review_text(s):
    """Keep facts and their locations together in all searchable representations."""
    r = s.get('full_text_review')
    lines = []
    if r:
        lines = ['全文摘錄：' + r['takeaway']]
        lines += [f'{label}：{r[key]["text"]}（{r[key]["locator"]}）' for key, label in FACTS.items()]
        lines += [f'結果：{f["text"]}（{f["locator"]}）' for f in r['results']]
        lines += [f'全文限制 [{f["origin"]}]：{f["text"]}（{f["locator"]}）' for f in r['limitations']]
        lines += ['閱讀評析：' + r['appraisal'], 'IRMS 工程推論：' + '；'.join(r['irms_implications'])]
        lines += ['原文疑點：' + q for q in r.get('open_questions', [])]
    lines += ['版本提醒：' + n['text'] + ' ' + n['url'] for n in s.get('version_notices', [])]
    return '\n'.join(lines)


def render_reviews(root, catalog, write):
    """Generate readable evidence notes and a comparison index from canonical extractions."""
    date = catalog['review_update_date']
    count = sum('full_text_review' in s for s in catalog['sources'])
    index = ['# 核心文獻全文精讀', '', f'更新：{date}；{count} 篇。來源搜尋截止日仍為 {catalog["snapshot_date"]}。', '',
             '本次依方法、結果、表格與限制，進行單人全文摘錄；不是完整系統性回顧、獨立雙人擷取或正式偏誤風險評分。每項研究事實附原文章節或表格；XML 沒有固定 PDF 頁碼，因此不臆測頁數。未報告的資訊保留未知。', '',
             '[知識庫首頁](README.md) · [結構化全文摘錄](data/full-text-reviews.json) · [版本查核](data/full-text-version-audit.json)', '',
             '| 主題／研究 | 族群與樣本 | 可支持的用途 |', '|---|---|---|']
    for s in catalog['sources']:
        r = s.get('full_text_review')
        if not r:
            continue
        a = r['access']
        body = ['# ' + s['title'], '', f'來源：[{s["id"]}](../sources/{s["id"]}.md)；摘錄日：{date}。', '',
                f'[原始全文]({a["full_text_url"]}) · [原始 XML]({a["xml_url"]})', '', '## 核心判讀', '', r['takeaway'], '',
                '## 研究事實與定位', '', '| 欄位 | 摘錄 | 原文位置 |', '|---|---|---|']
        body += [f'| {label} | {r[k]["text"]} | {r[k]["locator"]} |' for k, label in FACTS.items()]
        body += ['', '## 結果', ''] + [f'- {f["text"]}（{f["locator"]}）' for f in r['results']]
        body += ['', '## 限制與閱讀評析', ''] + [f'- {f["text"]}（{f["locator"]}；{f["origin"]}）' for f in r['limitations']]
        body += ['', r['appraisal'], '', '## IRMS 工程推論', '', '以下是專案推論，不是原文直接驗證 IRMS 的結果。', '']
        body += ['- ' + t for t in r['irms_implications']]
        if r.get('open_questions'):
            body += ['', '## 原文疑點：待釐清', ''] + ['- ' + q for q in r['open_questions']]
        body += ['', '## 取得與重現', '', f'全文身分：{a["pmcid"]}；取得：{a["retrieved_on"]}；格式：JATS XML。', '',
                 f'原始回應 SHA-256：`{a["sha256"]}`。全文暫存供本次擷取查核，沒有收錄或重新散布於此 repo。', '',
                 '版本查核只涵蓋 Europe PMC MED 的 commentCorrectionList 與 XML related-article 欄位，不能保證不存在其他更正。', '',
                 '[精讀索引](../FULL_TEXT_REVIEW.md) · [原創摘錄資料](../data/full-text-reviews.json)', '']
        write(root / 'reviews' / (s['id'] + '.md'), '\n'.join(body))
        index.append(f'| [{r["focus"]}](reviews/{s["id"]}.md) ({s.get("year")}) | {r["participants"]["text"]} | {r["takeaway"]} |')
    index += ['', '## 採用數值前的界限', '',
              '- 機械鉸鏈、健康步行、神經疾病回饋與術後使用性研究，須分別解讀；受試者數、研究數與重複試次不能混用。',
              '- 離線最佳化、光學初始化、每組資料調參及移除平均偏差，均不能直接代表 IRMS 即時絕對角度誤差。',
              '- 原文有數值衝突時，摘錄保留並標記；不自行更正後當作已確認結論。Olsson 軸辨識、Seel 表格與 Bowman 統計敘述均有待釐清項目。',
              '- [ICC 指引](sources/PMID-27330520.md) 有 [2017 更正通知](https://pubmed.ncbi.nlm.nih.gov/29276468/)。全文取得失敗，維持摘要層級；本次未擷取更正公式內容。',
              '- 上述來源尚不能建立 IRMS 本身的精度、診斷能力或療效；工程落地請對照 [驗證計畫](VALIDATION_PLAN.md)。', '']
    write(root / 'FULL_TEXT_REVIEW.md', '\n'.join(index))
