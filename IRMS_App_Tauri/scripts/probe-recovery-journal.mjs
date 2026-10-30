// 隔離瀏覽器證據探測；只讀專案原型，所有資料與設定檔均為本次合成暫存。
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
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
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const browserPath = process.argv[2]
const outputPath = process.argv[3] === '--output' ? process.argv[4] : undefined
if (!browserPath || !statSync(browserPath).isFile() || ![3, 5].includes(process.argv.length) || process.argv.length === 5 && !outputPath) {
  throw new Error('Usage: node scripts/probe-recovery-journal.mjs browser-executable [--output report.json]')
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
  if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>IRMS synthetic journal probe</title>') }
  else if (request.url === '/prototype.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(emitted) }
  else { response.writeHead(404); response.end() }
})
let browser, channel, report, failed = false, caseName = 'startup'
const cases = []
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
    await evaluate(`(async()=>{globalThis.mod = await import('/prototype.js');
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
  report = { schemaVersion: 1, dataOrigin: 'synthetic', passed: cases.length, cases,
    sources: { 'src/services/recoveryJournalPrototype.ts': hash(source), 'scripts/probe-recovery-journal.mjs': hash(readFileSync(new URL(import.meta.url))) },
    runtime: { node: process.version, typescript: ts.version, browser: version.product, protocol: version.protocolVersion, platform: process.platform },
    scope: { realIndexedDB: true, isolatedProfile: true, sameOriginOnRestart: true, forcedOwnedBrowserTermination: true,
      strictDurabilityRequestedAndObserved: true, nativeSink: 'simulated-acknowledgement-only', productionConnected: false,
      webViewVerified: false, powerLossVerified: false, evictionVerified: false, nativeDeletionRestoreVerified: false } }
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
