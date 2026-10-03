"""Validate reference identity, generated exports, local links and search artifacts."""
import collections
import hashlib
import json
import pathlib
import re
import sqlite3
import subprocess
import sys
import urllib.parse

from build import ROOT, load_catalog


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    catalog, topics = load_catalog()
    ids = {s['id'] for s in catalog['sources']}
    topic_ids = {t['id'] for t in topics}
    require(ids == {p.stem for p in (ROOT / 'sources').glob('*.md')}, 'Source cards mismatch')
    require(topic_ids == {p.stem for p in (ROOT / 'topics').glob('*.md')}, 'Topic cards mismatch')
    records = [json.loads(line) for line in (ROOT / 'data/retrieval.jsonl').read_text(encoding='utf-8').splitlines()]
    require(len(records) == len(ids) and {r['id'] for r in records} == ids, 'Retrieval mismatch')
    for r in records:
        citation_present = r['url'] in r['text'] or bool(r.get('doi') and r['doi'] in r['text'])
        require('限制：' in r['text'] and '閱讀深度：' in r['text'] and citation_present, 'Retrieval lost citation/limits')
    ris = (ROOT / 'references.ris').read_text(encoding='utf-8')
    bib = (ROOT / 'references.bib').read_text(encoding='utf-8')
    require(set(re.findall(r'^ID  - (.+)$', ris, re.M)) == ids and len(re.findall(r'^ER  -$', ris, re.M)) == len(ids), 'RIS identity mismatch')
    require(set(re.findall(r'^@\w+\{([^,]+),$', bib, re.M)) == ids, 'BibTeX identity mismatch')
    balance = 0
    for token in re.findall(r'(?<!\\)[{}]', bib):
        balance += 1 if token == '{' else -1
        require(balance >= 0, 'BibTeX unexpected closing brace')
    require(balance == 0, 'BibTeX unbalanced braces')
    stats = json.loads((ROOT / 'data/stats.json').read_text(encoding='utf-8'))
    require(stats['source_count'] == len(ids) and stats['topic_count'] == len(topics), 'Stats mismatch')
    require(stats['review_levels'] == dict(collections.Counter(s['review_level'] for s in catalog['sources'])), 'Review stats mismatch')
    broken, links = [], 0
    for p in ROOT.rglob('*.md'):
        for url in re.findall(r'\]\(([^)]+)\)', p.read_text(encoding='utf-8')):
            url = url.strip('<>')
            parsed = urllib.parse.urlsplit(url)
            if parsed.scheme or not parsed.path:
                continue
            links += 1
            if not (p.parent / urllib.parse.unquote(parsed.path)).exists():
                broken.append(f'{p.relative_to(ROOT)}: {url}')
    require(not broken, 'Broken local links: ' + '\n'.join(broken))
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    require('__CATALOG__' not in html and '__TOPICS__' not in html, 'HTML template unexpanded')
    dbpath = ROOT / 'irms-knowledge.sqlite'
    if dbpath.exists():
        with sqlite3.connect(f'{dbpath.as_uri()}?mode=ro', uri=True) as db:
            require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'SQLite integrity')
            require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'SQLite foreign keys')
            require(db.execute('SELECT COUNT(*) FROM sources').fetchone()[0] == len(ids), 'SQLite count')
            require(db.execute("SELECT COUNT(*) FROM sources_fts WHERE sources_fts MATCH 'calibration'").fetchone()[0] > 0, 'SQLite FTS search')
    outputs = list((ROOT / 'sources').glob('*.md')) + list((ROOT / 'topics').glob('*.md'))
    outputs += [ROOT / p for p in ['INDEX.md', 'references.bib', 'references.ris', 'index.html', 'data/stats.json', 'data/retrieval.jsonl']]
    before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in outputs}
    subprocess.run([sys.executable, str(ROOT / 'scripts/build.py'), '--no-sqlite'], check=True, stdout=subprocess.DEVNULL)
    require(all(hashlib.sha256(p.read_bytes()).hexdigest() == sha for p, sha in before.items()), 'Non-deterministic generated output')
    print(json.dumps({'sources': len(ids), 'topics': len(topics), 'local_links': links, 'citation_exports': 'passed',
                      'retrieval_limits': 'passed', 'sqlite': 'passed' if dbpath.exists() else 'not-built',
                      'deterministic_rebuild': 'passed'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
