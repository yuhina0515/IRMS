/* Exercise the generated search logic in a minimal DOM model; this is not browser visual acceptance. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(scripts.length, 3);
const catalog = JSON.parse(scripts[0]);
const topics = JSON.parse(scripts[1]);
class Element {
  constructor(tag = '') { this.tagName = tag; this.children = []; this.textContent = ''; this.value = ''; this.checked = false; this.events = {}; }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  addEventListener(name, fn) { this.events[name] = fn; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  fire(name) { this.events[name](); }
}
const elements = Object.fromEntries(['catalog', 'topics', 'query', 'topic', 'kind', 'depth', 'core', 'results', 'status', 'citation', 'prev', 'next'].map(id => [id, new Element(id)]));
elements.catalog.textContent = scripts[0]; elements.topics.textContent = scripts[1];
vm.runInNewContext(scripts[2], { document: { getElementById: id => elements[id], createElement: tag => new Element(tag) } }, { timeout: 1000 });
assert.match(elements.status.textContent, new RegExp(`符合 ${catalog.sources.length} 筆`));
assert.equal(elements.results.children.length, 25);
assert.equal(elements.prev.disabled, true);
elements.next.fire('click'); assert.match(elements.status.textContent, /第 2／/);
elements.prev.fire('click'); assert.match(elements.status.textContent, /第 1／/);
function set(id, value) { elements[id].value = value; elements[id].fire('input'); }
function count(n) { assert.match(elements.status.textContent, new RegExp(`符合 ${n} 筆；`)); }
set('query', '32545227'); count(1);
elements.results.children[0].children.at(-1).fire('click');
assert.match(elements.citation.value, /10\.3390\/s20113322/);
assert.equal(elements.citation.focused && elements.citation.selected, true);
set('query', '校準'); assert.ok(elements.results.children.length > 0);
set('query', 'Bland'); assert.ok(elements.results.children.length > 0);
set('query', 'no-result-irms-123456789'); count(0); assert.equal(elements.next.disabled, true);
set('query', ''); set('topic', 'validation'); count(catalog.sources.filter(s => s.topics.includes('validation')).length);
set('topic', ''); set('kind', 'dataset'); count(3);
set('kind', ''); set('depth', 'metadata-only'); count(2);
for (const article of elements.results.children) assert.match(article.children.find(e => e.tagName === 'details').children[2].textContent, /^限制：/);
set('depth', 'full-text-extracted'); count(catalog.sources.filter(s => s.full_text_review).length);
for (const article of elements.results.children) {
  const details = article.children.find(e => e.tagName === 'details');
  assert.ok(details.children.some(e => e.tagName === 'a' && e.href.startsWith('reviews/')));
}
set('depth', ''); set('query', 'GTSAM'); count(1);
assert.match(elements.results.children[0].children[1].textContent, /35408159/);
set('query', '29276468'); count(1);
const corrected = elements.results.children[0].children.find(e => e.tagName === 'details');
assert.ok(corrected.children.some(e => e.textContent.startsWith('版本提醒：')));
set('query', '');
set('depth', ''); elements.core.checked = true; elements.core.fire('input'); count(catalog.sources.filter(s => s.priority === 'core').length);
assert.equal(elements.topic.children.length, topics.length);
console.log(JSON.stringify({ sourceCount: catalog.sources.length, fullTextCount: catalog.sources.filter(s => s.full_text_review).length, checks: ['Chinese/English/PMID search', 'empty results', 'topic/type/depth/core filters', 'pagination', 'citation display', 'limitations retained', 'full-text-only keyword and evidence links', 'correction notice search/display'], environment: 'Node VM with minimal DOM; browser rendering not verified' }));
