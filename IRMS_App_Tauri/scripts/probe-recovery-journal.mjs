// 隔離瀏覽器證據探測；只讀專案原型，所有資料與設定檔均為本次合成暫存。
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, basename, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

async function main() {
const { default: ts } = await import('typescript')
const hash = value => createHash('sha256').update(value).digest('hex')
const sourcePath = new URL('../src/services/recoveryJournalPrototype.ts', import.meta.url)
const source = readFileSync(sourcePath, 'utf8')
const emitted = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const ownerSource = readFileSync(new URL('../src/services/historyTransitionPrototype.ts', import.meta.url), 'utf8')
const ownerEmitted = ts.transpileModule(ownerSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const budgetSource = readFileSync(new URL('../src/shared/storage-budget.json', import.meta.url), 'utf8')
const budgetModule = `export default ${JSON.stringify(JSON.parse(budgetSource))};`
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const browserPath = process.argv[2]
const options = new Map()
for (let i = 3; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1]
  if (!['--output', '--native-oracle'].includes(key) || !value || options.has(key)) throw new Error('Invalid probe options')
  options.set(key, value)
}
const outputPath = options.get('--output'), nativeOracle = options.get('--native-oracle')
if (!browserPath || !statSync(browserPath).isFile() || nativeOracle && !statSync(nativeOracle).isFile()) {
  throw new Error('Invalid probe executable')
}

// CDP 僅用於本次自行啟動的 headless browser 測試，不連到使用者的瀏覽器工作階段。
async function connect(endpoint) {
  const address = new URL(endpoint)
  if (address.protocol !== 'ws:' || address.hostname !== '127.0.0.1') throw new Error('Non-loopback browser endpoint')
  const socket = new WebSocket(endpoint)
  await once(socket, 'open')
  let next = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    const request = pending.get(message.id)
    if (!request) return
    clearTimeout(request.timer); pending.delete(message.id)
    if (message.error) request.reject(new Error('Browser protocol error'))
    else request.resolve(message.result)
  })
  socket.addEventListener('close', () => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Browser connection closed')) }
    pending.clear()
  })
  return { close: () => socket.close(), send: (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser operation timed out')) }, 30000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  }) }
}

const directory = mkdtempSync(join(tmpdir(), 'irms-journal-probe-'))
const profile = join(directory, 'profile')
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>IRMS synthetic journal probe</title><script type="importmap">{"imports":{"@shared/storage-budget.json":"/storage-budget.js"}}</script>') }
  else if (request.url === '/prototype.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(emitted) }
  else if (request.url === '/history-gate.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(ownerEmitted) }
  else if (request.url === '/storage-budget.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(budgetModule) }
  else { response.writeHead(404); response.end() }
})
let browser, channel, report, failed = false, caseName = 'startup'
const cases = []
// 僅由測試父程序呼叫精確 ignored test；不向瀏覽器提供原生端點或任意路徑。
function native(op, database = 'native', batch) {
  writeFileSync(join(directory, 'native-request.json'), JSON.stringify({ op, database, ...(batch ? { batch } : {}) }))
  const child = spawnSync(nativeOracle, ['--exact', 'recovery_oracle::manual_recovery_oracle', '--ignored', '--nocapture'], {
    windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
    env: { ...process.env, IRMS_RECOVERY_ORACLE_ROOT: directory },
  })
  const matches = [...(child.stdout ?? '').matchAll(/^IRMS_RECOVERY_ORACLE (.+)$/gm)]
  if (child.error || child.status !== 0 || matches.length !== 1) throw new Error('Native oracle failed')
  const result = JSON.parse(matches[0][1])
  if (result.status === 'infrastructureFailure') throw new Error('Native oracle failed')
  return result
}
async function stopBrowser() {
  channel?.close(); channel = undefined
  if (!browser || browser.exitCode !== null || browser.signalCode !== null) return
  // PID 來自本次 spawn 的仍存活 child handle，絕不依程序名稱殺掉其他 Chrome。
  const child = browser
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    await once(killer, 'exit')
  } else child.kill('SIGKILL')
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Owned browser did not stop')), 10000)
      child.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
  if (child.exitCode === null && child.signalCode === null) throw new Error('Owned browser did not stop')
  browser = undefined
}
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  let page
  async function startBrowser() {
    browser = spawn(browserPath, ['--headless=new', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-extensions', '--disable-sync', '--hide-crash-restore-bubble',
      `--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', 'about:blank'],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 15000)
      browser.once('error', () => { clearTimeout(timer); reject(new Error('Cannot start browser')) })
      browser.stderr.on('data', data => {
        const match = String(data).match(/DevTools listening on (ws:\/\/[^\s]+)/)
        if (match) { clearTimeout(timer); resolve(match[1]) }
      })
    })
    channel = await connect(endpoint)
    const target = await channel.send('Target.createTarget', { url: origin })
    const attached = await channel.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    page = attached.sessionId
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await evaluate(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete'`)) break
      if (attempt === 199) throw new Error('Probe page did not load')
      await pause(25)
    }
    await evaluate(`(async()=>{globalThis.mod = await import('/prototype.js');globalThis.gateModule=await import('/history-gate.js');
      globalThis.name = 'irms-recovery-prototype-probe';
      globalThis.j = await mod.openRecoveryJournal(name);
      globalThis.batch = (count=1) => ({sessionId:1,storageIdentity:'a'.repeat(32)+'/'+'b'.repeat(32),batchId:crypto.randomUUID(),
        readings:Array.from({length:count},()=>({timestamp:'synthetic',kneeAngle:1,proximalAngle:2,distalAngle:3,kneeRoll:4,proximalRoll:5,distalRoll:6}))});
      globalThis.ack = value => ({sessionId:value.sessionId,storageIdentity:value.storageIdentity,batchId:value.batchId,count:value.readings.length});
      globalThis.reset = async () => {j.close(); await new Promise((yes,no)=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=yes;r.onerror=no}); j=await mod.openRecoveryJournal(name)};
      return true})()`)
    return channel.send('Browser.getVersion')
  }
  async function evaluate(expression) {
    const response = await channel.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, page)
    if (response.exceptionDetails) throw new Error('Browser expression failed')
    return response.result.value
  }
  async function check(name, expression) {
    caseName = name
    if (await evaluate(expression) !== true) throw new Error('Probe assertion failed')
    cases.push(name)
  }
  const version = await startBrowser()
  await check('commit-before-publish-and-strict-request', `(async()=>{const b=batch(); const order=await j.enqueue(b); const s=await j.stats(); return order>0&&s.rows===1&&s.observedDurability==='strict'})()`)
  await check('same-identity-idempotent', `(async()=>{const b=await j.peek();const a=await j.enqueue(b);const c=await j.enqueue(b);return a===c&&(await j.stats()).batches===1})()`)
  await check('changed-content-rejected', `(async()=>{const b=await j.peek(); b.readings[0].kneeAngle=99;try{await j.enqueue(b);return false}catch(e){return e.message==='Journal batch identity conflict'&&(await j.stats()).rows===1}})()`)
  await check('partial-ack-retained', `(async()=>{const b=await j.peek();try{await j.acknowledge({...ack(b),count:0});return false}catch{return (await j.stats()).rows===1}})()`)
  await check('foreign-owner-ack-retained', `(async()=>{const b=await j.peek();try{await j.acknowledge({...ack(b),sessionId:2});return false}catch{return (await j.stats()).rows===1}})()`)
  await check('unknown-binding-batch-and-overcount-ack-retained', `(async()=>{const b=await j.peek();for(const wrong of [{...ack(b),storageIdentity:'c'.repeat(32)+'/'+'d'.repeat(32)},{...ack(b),batchId:crypto.randomUUID()},{...ack(b),count:2}]){try{await j.acknowledge(wrong);return false}catch{}}return (await j.stats()).rows===1})()`)
  await check('out-of-order-ack-retained', `(async()=>{const b=batch();await j.enqueue(b);try{await j.acknowledge(ack(b));return false}catch{return (await j.stats()).rows===2}})()`)
  // 模擬 native 已確認但 journal 尚未刪除；這不是實際 Rust transport 的測試。
  caseName = 'committed-entry-force-kill-reopen'
  const before = await evaluate('j.peek()')
  const simulatedNative = new Map([[`${before.storageIdentity}/${before.batchId}`, JSON.stringify(before)]])
  await stopBrowser()
  await startBrowser()
  const after = await evaluate('j.peek()')
  if (JSON.stringify(after) !== JSON.stringify(before) || simulatedNative.get(`${after.storageIdentity}/${after.batchId}`) !== JSON.stringify(after)) throw new Error('Probe assertion failed')
  cases.push(caseName)
  await check('same-batch-after-simulated-lost-ack', `(async()=>{const b=await j.peek(); await j.acknowledge(ack(b)); return (await j.stats()).rows===1})()`)
  await check('close-open-preserves-second-entry', `(async()=>{j.close();j=await mod.openRecoveryJournal(name);return (await j.stats()).rows===1&&(await j.peek())!==null})()`)
  await check('input-copy-is-fixed-before-transaction', `(async()=>{await reset();const b=batch();const p=j.enqueue(b);b.readings[0].kneeAngle=77;await p;return (await j.peek()).readings[0].kneeAngle===1})()`)
  await check('concurrent-row-capacity-atomic', `(async()=>{await reset();const r=await Promise.allSettled([j.enqueue(batch(1000)),j.enqueue(batch(1000)),j.enqueue(batch())]);return r.filter(x=>x.status==='fulfilled').length===2&&(await j.stats()).rows===2000})()`)
  await check('batch-count-capacity-atomic', `(async()=>{await reset();const r=await Promise.allSettled(Array.from({length:129},()=>j.enqueue(batch())));return r.filter(x=>x.status==='fulfilled').length===128&&(await j.stats()).batches===128})()`)
  await check('byte-budget-rejects-without-write', `(async()=>{await reset();const b=batch(1000);for(const r of b.readings){r.timestamp='x'.repeat(128);for(const k of Object.keys(r))if(k!=='timestamp')r[k]=Number.MAX_VALUE}await j.enqueue(b);try{await j.enqueue({...b,batchId:crypto.randomUUID()});return false}catch{return (await j.stats()).batches===1}})()`)
  await check('abort-after-request-success-is-not-published', `(async()=>{await reset();const original=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...a){const r=original.apply(this,a);r.addEventListener('success',()=>this.transaction.abort(),{once:true});return r};try{await j.enqueue(batch());return false}catch{return (await j.stats()).rows===0}finally{IDBObjectStore.prototype.add=original}})()`)
  await check('invalid-inputs-retain-empty-store', `(async()=>{await reset();const invalid=[{...batch(),extra:'private'}, {...batch(),readings:[]}, {...batch(),readings:batch(1001).readings}, {...batch(),storageIdentity:'private'}, {...batch(),storageIdentity:batch().storageIdentity+String.fromCharCode(10)}, {...batch(),batchId:crypto.randomUUID()+String.fromCharCode(10)}, {...batch(),sessionId:0}];const nan=batch();nan.readings[0].kneeAngle=NaN;invalid.push(nan);const unicode=batch();unicode.readings[0].timestamp='中'.repeat(43);invalid.push(unicode);for(const b of invalid){try{await j.enqueue(b);return false}catch(e){if(e.message.includes('private'))return false}}return (await j.stats()).rows===0})()`)
  await check('corrupt-counters-fail-closed-no-erasure', `(async()=>{await j.enqueue(batch());j.close();const db=await new Promise((y,n)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>y(r.result);r.onerror=n});await new Promise((y,n)=>{const t=db.transaction('meta','readwrite');t.objectStore('meta').put({key:'totals',rows:99,bytes:0,batches:0});t.oncomplete=y;t.onabort=n});db.close();try{j=await mod.openRecoveryJournal(name);return false}catch{const db=await new Promise(y=>{const r=indexedDB.open(name,1);r.onsuccess=()=>y(r.result)});const count=await new Promise(y=>{const r=db.transaction('entries').objectStore('entries').count();r.onsuccess=()=>y(r.result)});db.close();return count===1}})()`)
  await check('corrupt-record-fail-closed-no-erasure', `(async()=>{await reset();await j.enqueue(batch());j.close();const db=await new Promise(y=>{const r=indexedDB.open(name,1);r.onsuccess=()=>y(r.result)});await new Promise((y,n)=>{const t=db.transaction('entries','readwrite');const r=t.objectStore('entries').openCursor();r.onsuccess=()=>r.result.update({...r.result.value,payload:'private malformed'});t.oncomplete=y;t.onabort=n});db.close();try{j=await mod.openRecoveryJournal(name);return false}catch(e){const db=await new Promise(y=>{const r=indexedDB.open(name,1);r.onsuccess=()=>y(r.result)});const count=await new Promise(y=>{const r=db.transaction('entries').objectStore('entries').count();r.onsuccess=()=>y(r.result)});db.close();return count===1&&!e.message.includes('private')}})()`)
  await check('unexpected-meta-row-rejected-without-erasure', `(async()=>{await reset();j.close();const db=await new Promise(y=>{const r=indexedDB.open(name,1);r.onsuccess=()=>y(r.result)});await new Promise((y,n)=>{const t=db.transaction('meta','readwrite');t.objectStore('meta').put({key:'unexpected'});t.oncomplete=y;t.onabort=n});db.close();try{j=await mod.openRecoveryJournal(name);return false}catch{const db=await new Promise(y=>{const r=indexedDB.open(name,1);r.onsuccess=()=>y(r.result)});const count=await new Promise(y=>{const r=db.transaction('meta').objectStore('meta').count();r.onsuccess=()=>y(r.result)});db.close();return count===2}})()`)
  if (nativeOracle) {
    // 真實 SQLite 交易完成後丟棄回覆；journal 不得據此自行刪除。
    const assert = condition => { if (!condition) throw new Error('Probe assertion failed') }
    async function inspectNative(name, database, batch, expected) {
      caseName = name
      const before = await evaluate('j.peek()')
      const reply = native('reconcile', database, batch)
      if (expected === 'missingDatabase') assert(reply.status === expected)
      else {
        assert(reply.status === 'inspectedRecovery' && reply.automaticReplayAuthorized === false && reply.journalAcknowledgementAuthorized === false)
        for (const [key, value] of Object.entries(expected)) assert(reply.inspection[key] === value)
      }
      assert(JSON.stringify(await evaluate('j.peek()')) === JSON.stringify(before))
      cases.push(name)
    }
    const begun = native('init')
    assert(begun.status === 'started')
    await check('native-original-binding-enqueued', `(async()=>{await reset();const b={...batch(2),...${JSON.stringify(begun.started)}};b.readings.forEach(r=>r.timestamp='2099-01-01T00:00:00.000Z');await j.enqueue(b);return (await j.stats()).rows===2})()`)
    const original = await evaluate('j.peek()')
    await inspectNative('reconcile-open-unseen-retains-state-and-journal', 'native', original,
      { status: 'needsDecision', abandoned: false, ended: false })
    caseName = 'native-commit-lost-reply-browser-kill-retry'
    assert(native('append', 'native', original).status === 'committed')
    await stopBrowser(); await startBrowser()
    const replay = await evaluate('j.peek()')
    assert(JSON.stringify(replay) === JSON.stringify(original))
    const reply = native('append', 'native', replay), state = native('inspect')
    assert(reply.status === 'committed' && reply.count === 2 && state.rows === 2 && state.receipts === 1)
    // append/inspect 會執行啟動孤兒收尾；唯讀 reconcile 分支不執行 init。
    assert(state.ended === 1 && state.abandoned === 1 && state.staleEnd === 1)
    cases.push(caseName)
    await inspectNative('reconcile-committed-abandoned-receipt-is-not-ack-authority', 'native', replay,
      { status: 'receiptMatched', count: 2, abandoned: true, ended: true })
    const changed = structuredClone(replay); changed.readings[0].kneeAngle = 88
    await inspectNative('reconcile-changed-payload-retains-original-journal', 'native', changed, { status: 'receiptConflict' })
    caseName = 'native-changed-payload-conflicts-without-duplicate'
    assert(native('append', 'native', changed).status === 'rejected' && native('inspect').rows === 2)
    assert(await evaluate('j.stats().then(s=>s.rows)') === 2); cases.push(caseName)
    caseName = 'native-ack-before-journal-delete-interruption'
    await evaluate(`(async()=>{const add=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(...a){const r=add.apply(this,a);r.addEventListener('success',()=>this.transaction.abort(),{once:true});return r};try{await j.acknowledge(ack(await j.peek()));return false}catch{return true}finally{IDBObjectStore.prototype.delete=add}})()`).then(assert)
    await stopBrowser(); await startBrowser()
    assert(JSON.stringify(await evaluate('j.peek()')) === JSON.stringify(original))
    const retried = native('append', 'native', await evaluate('j.peek()'))
    assert(retried.status === 'committed' && retried.count === 2 && native('inspect').rows === 2)
    await evaluate(`j.acknowledge(${JSON.stringify({ sessionId: replay.sessionId, storageIdentity: replay.storageIdentity, batchId: replay.batchId, count: retried.count })})`)
    assert(await evaluate('j.stats().then(s=>s.rows)') === 0); cases.push(caseName)
    await evaluate(`j.enqueue(${JSON.stringify({ ...original, batchId: '22222222-2222-4222-8222-222222222222' })})`)
    const pending = await evaluate('j.peek()')
    caseName = 'native-missing-database-retains-journal-no-create'
    assert(native('append', 'backup', pending).status === 'missingDatabase')
    assert(JSON.stringify(await evaluate('j.peek()')) === JSON.stringify(pending)); cases.push(caseName)
    await inspectNative('reconcile-missing-database-does-not-create', 'backup', pending, 'missingDatabase')
    caseName = 'native-foreign-database-retains-original-journal'
    const foreign = native('init', 'foreign')
    assert(foreign.started.sessionId === pending.sessionId && foreign.started.storageIdentity !== pending.storageIdentity)
    assert(native('append', 'foreign', pending).status === 'rejected' && native('inspect', 'foreign').rows === 0)
    assert(JSON.stringify(await evaluate('j.peek()')) === JSON.stringify(pending)); cases.push(caseName)
    await inspectNative('reconcile-foreign-binding-retains-journal', 'foreign', pending, { status: 'associationRejected' })
    caseName = 'native-missing-session-retains-original-journal'
    assert(native('append', 'native', { ...pending, sessionId: 99999 }).status === 'rejected')
    assert(native('inspect').rows === 2 && JSON.stringify(await evaluate('j.peek()')) === JSON.stringify(pending)); cases.push(caseName)
    await inspectNative('reconcile-missing-session-retains-journal', 'native', { ...pending, sessionId: 99999 }, { status: 'associationRejected' })
    // 同血統備份保留 identity；舊備份與目前刪除歷史不能僅靠 matching key 判別。
    assert(native('backup').status === 'backedUp')
    caseName = 'native-deleted-session-retains-journal-no-recreate'
    assert(native('delete', 'native', pending).status === 'deleted')
    assert(native('append', 'native', pending).status === 'rejected')
    const deleted = native('inspect')
    assert(deleted.rows === 0 && deleted.receipts === 0 && deleted.sessions === 0)
    assert(JSON.stringify(await evaluate('j.peek()')) === JSON.stringify(pending)); cases.push(caseName)
    await inspectNative('reconcile-deleted-session-retains-journal', 'native', pending, { status: 'associationRejected' })
    caseName = 'native-recreated-numeric-id-rejects-old-binding'
    // SQLite AUTOINCREMENT 可能改變 ID，顯式 fixture 將重建場次固定為舊 ID。
    assert(native('recreate', 'native', pending).status === 'recreated')
    assert(native('append', 'native', pending).status === 'rejected' && native('inspect').rows === 0)
    assert(JSON.stringify(await evaluate('j.peek()')) === JSON.stringify(pending)); cases.push(caseName)
    await inspectNative('reconcile-recreated-id-retains-old-binding', 'native', pending, { status: 'associationRejected' })
    await inspectNative('reconcile-backup-unseen-needs-decision', 'backup', pending,
      { status: 'needsDecision', abandoned: true, ended: true })
    caseName = 'native-backup-divergence-observed-replay-not-authorized'
    assert(native('append', 'backup', pending).status === 'committed')
    assert(native('inspect', 'backup').rows === 4 && native('inspect').rows === 0)
    assert(JSON.stringify(await evaluate('j.peek()')) === JSON.stringify(pending)); cases.push(caseName)
    await inspectNative('reconcile-backup-matched-still-no-delete-authority', 'backup', pending,
      { status: 'receiptMatched', count: 2, abandoned: true, ended: true })
    const intent = { kind: 'delete', operationId: '33333333-3333-4333-8333-333333333333', sessionId: pending.sessionId, storageIdentity: pending.storageIdentity }
    await evaluate(`globalThis.intent=${JSON.stringify(intent)}`)
    await check('history-malformed-intents-retain-queue-without-fence', `(async()=>{for(const bad of [{...intent,kind:'private'}, {...intent,operationId:'private'}, {...intent,extra:true}, {...intent,kind:'restore'}, {...intent,sessionId:0}]){try{await j.markHistoryChange(bad);return false}catch{}}return (await j.stats()).historyFence===null&&(await j.stats()).rows===2})()`)
    await check('history-request-success-abort-does-not-publish-fence', `(async()=>{const old=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...a){const r=old.apply(this,a);if(a[0]?.key==='historyFence')r.addEventListener('success',()=>this.transaction.abort(),{once:true});return r};try{await j.markHistoryChange(intent);return false}catch{return (await j.stats()).historyFence===null&&(await j.stats()).rows===2}finally{IDBObjectStore.prototype.put=old}})()`)
    await check('history-delete-fence-commit-retains-queue', `(async()=>{await j.markHistoryChange(intent);const s=await j.stats();return s.historyFence.kind==='delete'&&s.observedDurability==='strict'&&s.rows===2})()`)
    const committedFence = (await evaluate('j.stats()')).historyFence
    await check('history-same-intent-idempotent', `(async()=>{await j.markHistoryChange({...intent});return (await j.stats()).historyFence.operationId===intent.operationId})()`)
    await check('history-conflicting-intent-retains-original', `(async()=>{for(const wrong of [{...intent,operationId:crypto.randomUUID()}, {...intent,sessionId:2},{...intent,storageIdentity:'a'.repeat(32)+'/'+'c'.repeat(32)},{kind:'restore',operationId:intent.operationId,sessionId:null,storageIdentity:null}]){try{await j.markHistoryChange(wrong);return false}catch{}}return (await j.stats()).historyFence.storageIdentity===intent.storageIdentity})()`)
    await check('history-fence-blocks-enqueue-and-full-ack', `(async()=>{const b=await j.peek();for(const op of [()=>j.enqueue(batch()),()=>j.acknowledge(ack(b))]){try{await op();return false}catch(e){if(e.message!=='Journal history change unresolved')return false}}return (await j.stats()).rows===2})()`)
    caseName = 'history-backup-matched-does-not-clear-fence'
    assert(native('reconcile', 'backup', pending).inspection.status === 'receiptMatched')
    assert(JSON.stringify((await evaluate('j.stats()')).historyFence) === JSON.stringify(committedFence)); cases.push(caseName)
    caseName = 'history-native-rejection-does-not-clear-fence'
    assert(native('append', 'native', pending).status === 'rejected')
    assert(JSON.stringify((await evaluate('j.stats()')).historyFence) === JSON.stringify(committedFence)); cases.push(caseName)
    caseName = 'history-native-delete-lost-reply-browser-kill-retains-intent-and-queue'
    // 只有 fence 的 complete promise 已完成才走 native；回覆丟棄不解除 intent。
    assert(native('delete', 'backup', pending).status === 'deleted')
    await stopBrowser(); await startBrowser()
    assert(native('inspect', 'backup').sessions === 0)
    assert(JSON.stringify((await evaluate('j.stats()')).historyFence) === JSON.stringify(committedFence))
    assert(JSON.stringify(await evaluate('j.peek()')) === JSON.stringify(pending)); cases.push(caseName)
    await evaluate(`globalThis.intent=${JSON.stringify(intent)}`)
    await check('history-preceding-enqueue-retained-after-fence', `(async()=>{await reset();await Promise.all([j.enqueue(batch()),j.markHistoryChange(intent)]);try{await j.acknowledge(ack(await j.peek()));return false}catch{return (await j.stats()).rows===1&&(await j.stats()).historyFence!==null}})()`)
    await check('history-concurrent-following-ack-sees-fence', `(async()=>{await reset();const b=batch();await j.enqueue(b);const r=await Promise.allSettled([j.markHistoryChange(intent),j.acknowledge(ack(b))]);return r[0].status==='fulfilled'&&r[1].status==='rejected'&&(await j.stats()).rows===1&&(await j.stats()).historyFence!==null})()`)
    await check('history-restore-fence-global-null-binding-persists', `(async()=>{await reset();await j.enqueue(batch());await j.markHistoryChange({kind:'restore',operationId:crypto.randomUUID(),sessionId:null,storageIdentity:null});j.close();j=await mod.openRecoveryJournal(name);try{await j.enqueue(batch());return false}catch{return (await j.stats()).historyFence.kind==='restore'&&(await j.stats()).rows===1}})()`)
    await check('history-unknown-meta-with-fence-failclosed-no-erasure', `(async()=>{j.close();const db=await new Promise(y=>{const r=indexedDB.open(name,1);r.onsuccess=()=>y(r.result)});await new Promise((y,n)=>{const t=db.transaction('meta','readwrite');t.objectStore('meta').put({key:'unknown'});t.oncomplete=y;t.onabort=n});db.close();try{j=await mod.openRecoveryJournal(name);return false}catch{const db=await new Promise(y=>{const r=indexedDB.open(name,1);r.onsuccess=()=>y(r.result)});const count=await new Promise(y=>{const r=db.transaction('meta').objectStore('meta').count();r.onsuccess=()=>y(r.result)});db.close();return count===3}})()`)
    await check('history-corrupt-fence-failclosed-no-erasure', `(async()=>{await reset();await j.enqueue(batch());j.close();const db=await new Promise(y=>{const r=indexedDB.open(name,1);r.onsuccess=()=>y(r.result)});await new Promise((y,n)=>{const t=db.transaction('meta','readwrite');t.objectStore('meta').put({key:'historyFence',kind:'restore',operationId:'private',sessionId:null,storageIdentity:null});t.oncomplete=y;t.onabort=n});db.close();try{j=await mod.openRecoveryJournal(name);return false}catch(e){const db=await new Promise(y=>{const r=indexedDB.open(name,1);r.onsuccess=()=>y(r.result)});const count=await new Promise(y=>{const r=db.transaction('entries').objectStore('entries').count();r.onsuccess=()=>y(r.result)});db.close();return count===1&&!e.message.includes('private')}})()`)
    // 實際 DB 已提交，但 transport 回覆由父程序控制；不是 Tauri IPC fault injection。
    const owned = native('init', 'backup')
    assert(owned.status === 'started')
    const ownedBatch = await evaluate(`(async()=>{await reset();const b={...batch(2),...${JSON.stringify(owned.started)}};await j.enqueue(b);return b})()`)
    const ownerIntent = { kind: 'delete', operationId: '44444444-4444-4444-8444-444444444444', sessionId: ownedBatch.sessionId, storageIdentity: ownedBatch.storageIdentity }
    async function prepareOwner(timeoutMs, nativeBatch) {
      await evaluate(`(()=>{globalThis.g=gateModule.createHistoryTransitionGate();globalThis.calls={fence:0,mutate:0};
        globalThis.pendingAppend=g.append(2,()=>new Promise(y=>globalThis.deliver=y)).then(()=>true,()=>false);
        globalThis.ready=new Promise(y=>globalThis.signalReady=y);return true})()`)
      assert(await evaluate('typeof deliver===\'function\''))
      const reply = native('append', 'backup', nativeBatch)
      assert(reply.status === 'committed' && reply.count === 2)
      await evaluate(`(()=>{globalThis.changing=g.change(async()=>{calls.fence++;await j.markHistoryChange(${JSON.stringify(ownerIntent)})},
        ()=>{calls.mutate++;signalReady();return new Promise(y=>globalThis.mutated=y)},${timeoutMs}).then(()=>true,()=>false);return true})()`)
      return reply
    }
    // 先登記 append，再呼叫真實 native，最後才啟動需要等待回覆的 history transition。
    const committed = await prepareOwner(10000, ownedBatch)
    await check('owner-actual-commit-delayed-reply-blocks-fence-and-mutation', `(async()=>{return g.snapshot().phase==='draining'&&calls.fence===0&&calls.mutate===0&&(await j.stats()).historyFence===null})()`)
    await check('owner-new-work-refused-during-actual-commit-drain', `(async()=>{try{await g.append(1,async()=>1);return false}catch{}try{await g.change(async()=>{},async()=>{});return false}catch{return calls.mutate===0}})()`)
    caseName = 'owner-full-native-count-before-fence-completion-and-delete-request'
    assert(await evaluate(`(async()=>{deliver(${committed.count});await ready;return (await pendingAppend)&&calls.fence===1&&calls.mutate===1&&g.snapshot().phase==='mutating'&&(await j.stats()).historyFence.kind==='delete'})()`))
    assert(native('inspect', 'backup').rows === 2); cases.push(caseName)
    caseName = 'owner-native-delete-result-keeps-held-journal'
    assert(native('delete', 'backup', ownedBatch).status === 'deleted')
    assert(await evaluate(`(async()=>{mutated();return (await changing)&&g.snapshot().reason==='historyComplete'&&(await j.stats()).rows===2})()`))
    assert(native('inspect', 'backup').sessions === 0); cases.push(caseName)
    caseName = 'owner-browser-restart-retains-fence-not-memory-owner'
    await stopBrowser(); await startBrowser()
    assert(await evaluate(`(async()=>typeof globalThis.g==='undefined'&&(await j.stats()).historyFence!==null)()`))
    assert(JSON.stringify(await evaluate('j.peek()')) === JSON.stringify(ownedBatch)); cases.push(caseName)
    // 明確建立另一個合成 fixture；不是解除前一個 owner／fence 的產品流程。
    const uncertain = native('init', 'backup')
    const uncertainBatch = await evaluate(`(async()=>{await reset();const b={...batch(2),...${JSON.stringify(uncertain.started)}};await j.enqueue(b);return b})()`)
    await prepareOwner(10000, uncertainBatch)
    await check('owner-short-reply-after-real-commit-never-mutates', `(async()=>{deliver(1);return !(await pendingAppend)&&!(await changing)&&g.snapshot().reason==='appendUncertain'&&calls.fence===0&&calls.mutate===0&&(await j.stats()).rows===2&&(await j.stats()).historyFence===null})()`)
    assert(native('inspect', 'backup').rows === 2)
    const lateReply = await prepareOwner(25, uncertainBatch)
    await check('owner-withheld-reply-after-real-commit-times-out-without-mutation', `(async()=>{return !(await changing)&&g.snapshot().reason==='drainTimedOut'&&g.snapshot().pendingAppend&&calls.fence===0&&calls.mutate===0&&(await j.stats()).historyFence===null})()`)
    await check('owner-late-full-native-count-cannot-release-timeout', `(async()=>{deliver(${lateReply.count});await pendingAppend;return g.snapshot().reason==='drainTimedOut'&&!g.snapshot().pendingAppend&&calls.fence===0&&calls.mutate===0&&(await j.stats()).rows===2})()`)
    assert(native('inspect', 'backup').rows === 2)
  }
  report = { schemaVersion: 1, dataOrigin: 'synthetic', passed: cases.length, cases,
    sources: { 'src/services/recoveryJournalPrototype.ts': hash(source), 'src/services/historyTransitionPrototype.ts': hash(ownerSource),
      'src/shared/storage-budget.json': hash(budgetSource), 'scripts/probe-recovery-journal.mjs': hash(readFileSync(new URL(import.meta.url))) },
    runtime: { node: process.version, typescript: ts.version, browser: version.product, protocol: version.protocolVersion, platform: process.platform },
    servedModules: { prototypeSha256: hash(emitted), historyGateSha256: hash(ownerEmitted), storageBudgetSha256: hash(budgetModule) },
    scope: { realIndexedDB: true, isolatedProfile: true, sameOriginOnRestart: true, forcedOwnedBrowserTermination: true,
      strictDurabilityRequestedAndObserved: true, nativeSink: nativeOracle ? 'actual-Rust-SQLite-test-oracle' : 'simulated-acknowledgement-only', productionConnected: false,
      actualTauriIPC: false, nativeProcessPerRequest: Boolean(nativeOracle), backupDivergenceObserved: Boolean(nativeOracle), automaticReplayAuthorized: false,
      isolatedNativeDeletionVerified: Boolean(nativeOracle), restoreGenerationDetectionImplemented: false,
      webViewVerified: false, powerLossVerified: false, evictionVerified: false, nativeDeletionRestoreVerified: false } }
  if (nativeOracle) {
    report.native = { testFilter: 'recovery_oracle::manual_recovery_oracle', executableSha256: hash(readFileSync(nativeOracle)),
      sourceHashes: Object.fromEntries(['recovery_oracle.rs', 'db.rs', 'commands.rs', 'migrations.rs', 'types.rs'].map(name =>
        [`src-tauri/src/${name}`, hash(readFileSync(new URL(`../src-tauri/src/${name}`, import.meta.url)))])),
      observedStartup: { abandoned: true, endedBeforeSyntheticTail: true, reconciliationImplemented: false },
      readOnlyInspection: { prototype: true, skipsInitialization: true, readOnlyOpen: true, noReplayOrJournalAckAuthority: true },
      historyFence: { prototype: true, singletonUnresolvedIntent: true, enqueueAndAckBlocked: true, clearAPI: false,
        nativeInflightQuiescenceImplemented: false, externalRestoreDetectionImplemented: false },
      historyOwner: { actualBrowserGate: true, actualSQLiteCommit: true, controlledAcknowledgementTransport: true,
        fullReplyBeforeFenceBeforeNativeDelete: true, ownerMemorySurvivesBrowserRestart: false, productionQuiescenceVerified: false },
      boundaries: 'Actual repository+shared input validation; parent discards committed reply; no Tauri IPC or native force-kill/power-loss claim' }
  }
} catch (error) {
  failed = true
  // 僅回報本探測器的固定錯誤類別，不輸出 protocol／payload／私人檔案路徑。
  const categories = ['Browser expression failed', 'Browser operation timed out', 'Browser startup timed out', 'Probe page did not load', 'Probe assertion failed']
  console.error(`Journal probe failed: ${caseName} (${categories.includes(error.message) ? error.message : 'Probe infrastructure error'})`)
} finally {
  await stopBrowser()
  await new Promise(resolve => server.close(resolve))
  const target = resolve(directory)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('irms-journal-probe-') || resolve(profile) !== join(target, 'profile')) throw new Error('Unsafe probe cleanup path')
  rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
if (!failed && report) {
  report.cleanup = { ownedBrowserStopped: true, temporaryProfileRemoved: true, loopbackServerClosed: true }
  const json = JSON.stringify(report, null, 2) + '\n'
  if (outputPath) writeFileSync(outputPath, json)
  console.log(json)
}
return failed ? 1 : 0
}

// 包含初始化、finally 清理與報告輸出的最外層遮蔽；原生錯誤不可列印私人路徑。
export async function runWithRedactedErrors(work) {
  try { return await work() }
  catch { console.error('Journal probe infrastructure failure'); return 1 }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runWithRedactedErrors(main)
}
