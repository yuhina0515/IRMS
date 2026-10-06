"""Load traceable claim mappings and keep discrepancy rules in every evidence export."""
import json
import re


def load_audits(root, catalog):
    """核對來源、查核定位及主張對照，防止疑點在搜尋匯出中遺失。"""
    sources = {s['id']: s for s in catalog['sources']}
    audit = json.loads((root / 'data/reconciliation.json').read_text(encoding='utf-8'))
    seen = set()
    for c in audit['cases']:
        sid = c['source_id']
        if sid not in sources or sid in seen or not c['conclusion'] or not c['use_rule'] or not c['locator']:
            raise ValueError('Invalid reconciliation: ' + sid)
        seen.add(sid)
        for entry in c['sources']:
            if not entry['url'].startswith('https://') or not entry['locator']:
                raise ValueError('Invalid audit provenance: ' + sid)
            if entry.get('sha256') and not re.fullmatch('[a-f0-9]{64}', entry['sha256']):
                raise ValueError('Invalid audit SHA-256: ' + sid)
        sources[sid]['evidence_reconciliation'] = dict(c, checked_on=audit['checked_on'])
    mapping = json.loads((root / 'data/evidence-map.json').read_text(encoding='utf-8'))
    claim_ids = [c['id'] for c in mapping['claims']]
    if set(claim_ids) != {f'C{i:02}' for i in range(1, 26)} or len(claim_ids) != 25:
        raise ValueError('Claim map identity mismatch')
    validation_ids = {f'V{i:02}' for i in range(1, 13)}
    used = set()
    for c in mapping['claims']:
        if not c['gap'] or not c['acceptance_evidence'] or not set(c['validation_ids']) <= validation_ids:
            raise ValueError('Incomplete claim gap: ' + c['id'])
        used.update(c['validation_ids'])
        for e in c['evidence']:
            if e['source_id'] not in sources or not e['locator'] or e['review_level'] != sources[e['source_id']]['review_level']:
                raise ValueError('Stale mapped evidence: ' + c['id'])
        for path in c['app_paths']:
            if not (root.parents[1] / path).exists():
                raise ValueError('Stale mapped code: ' + path)
    if used != validation_ids:
        raise ValueError('Missing validation activity in claim map')
    quality = json.loads((root / 'data/quality-appraisals.json').read_text(encoding='utf-8'))
    assessed = set()
    for a in quality['appraisals']:
        sid = a['source_id']
        if sid not in sources or sid in assessed or a['tool'] not in quality['tools']:
            raise ValueError('Invalid quality identity: ' + sid)
        assessed.add(sid)
        expected = quality['tools'][a['tool']]['items']
        if len(a['items']) != expected or {i['id'] for i in a['items']} != {f'Q{i:02}' for i in range(1, expected + 1)}:
            raise ValueError('Incomplete quality checklist: ' + sid)
        for item in a['items']:
            answers = {'yes', 'no', 'unclear', 'not-applicable'} if a['tool'].startswith('JBI-') else {'reported', 'concern', 'unclear', 'not-applicable'}
            if item['answer'] not in answers or not item['reason'] or not item['locator']:
                raise ValueError('Unlocated quality judgment: ' + sid)
        sources[sid]['quality_appraisal'] = dict(a, checked_on=quality['checked_on'], reviewer=quality['reviewer'])
    if assessed != set(quality['target_source_ids']) or not assessed <= {s['id'] for s in sources.values() if s['review_level'] == 'full-text-extracted'}:
        raise ValueError('Quality/extraction scope mismatch')
    catalog['evidence_audit_date'] = audit['checked_on']
    return mapping


def render_mapping(root, mapping, write):
    """產生主張、全文定位、實作差距與完成證據矩陣。"""
    lines = ['# IRMS 主張與全文證據對照', '', f'查核：{mapping["checked_on"]}；App 快照 `{mapping["app_commit"]}`。', '',
             '25 主張與 12 驗證活動全部對照。閱讀深度逐筆保留；工程推論和待驗證要求不是 IRMS 已有的性能結果。', '',
             '[引用主張](CLAIMS.md) · [驗證計畫](VALIDATION_PLAN.md) · [數值查核](EVIDENCE_RECONCILIATION.md) · [資料](data/evidence-map.json)', '']
    for c in mapping['claims']:
        lines += ['## ' + c['id'] + ' — ' + c['claim'], '', '**來源與實際閱讀位置**', '']
        lines += [f'- [{e["source_id"]}](sources/{e["source_id"]}.md)：{e["locator"]}；`{e["review_level"]}`。' for e in c['evidence']]
        lines += ['', '**實作對照**：' + ' · '.join(f'[{p}](../../{p})' for p in c['app_paths']), '',
                  '**尚缺**：' + c['gap'], '', '**完成所需證據**：' + c['acceptance_evidence'], '',
                  '**驗證活動**：' + '、'.join(c['validation_ids']) + '（[工作表](VALIDATION_PLAN.md)）。', '']
    write(root / 'EVIDENCE_MAP.md', '\n'.join(lines))


def render_quality(root, catalog, write):
    """分開呈現已發表清單與自訂工程檢查，不產生虛構總分。"""
    data = json.loads((root / 'data/quality-appraisals.json').read_text(encoding='utf-8'))
    lines = ['# 核心文獻品質與外推域評估', '', '查核：' + data['checked_on'], '',
             '同一代理第二次核對，非獨立雙人審查；五篇系統回顧與兩篇質性部分使用 JBI 2017 歷史清單作教育性單人評讀。七篇工程方法／示例／統計教程使用明示的自訂域檢查，未經驗證，不能稱臨床偏誤工具。沒有跨設計品質總分或療效等級。', '',
             'yes／no／unclear 是對單項報告的判讀；unclear 不等於方法必然沒有執行。reported／concern 是自訂工程域狀態。正式 JBI 系統回顧要求獨立評讀及共識，此庫尚未做到。', '',
             '[JBI 原始工具入口](https://jbi.global/critical-appraisal-tools) · [資料](data/quality-appraisals.json) · [全文精讀](FULL_TEXT_REVIEW.md)', '']
    for tool, info in data['tools'].items():
        lines += [f'- {tool}：[版本入口]({info["url"]})；{info["role"]}。']
    for s in catalog['sources']:
        a = s.get('quality_appraisal')
        if not a:
            continue
        lines += ['', '## ' + s['id'], '', f'[{s["title"]}](reviews/{s["id"]}.md)', '',
                  a['tool'] + '；' + a['assessment_scope'], '', '| 項目 | 判讀 | 理由與原文位置 |', '|---|---|---|']
        lines += [f'| {i["id"]} {i["domain"]} | {i["answer"]} | {i["reason"]}（{i["locator"]}） |' for i in a['items']]
    write(root / 'QUALITY_APPRAISAL.md', '\n'.join(lines) + '\n')
