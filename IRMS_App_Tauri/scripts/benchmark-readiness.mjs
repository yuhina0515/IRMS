// 可重現的離線合成基準；只量測正式邏輯，不連接裝置、收集器或使用者資料。
import { createServer } from 'vite'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { cpus, totalmem } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('..', import.meta.url))
process.chdir(root)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const hash = data => createHash('sha256').update(data).digest('hex')
// 涵蓋間接依賴與未提交的新基準來源；只收錄來源檔案內容雜湊，不公開私人路徑。
const sources = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard',
  'src', 'src-tauri/src', 'src-tauri/migrations', 'scripts', 'package.json', 'package-lock.json',
  'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock').split(/\r?\n/))]
  .filter(p => /\.(?:ts|tsx|rs|mjs|json|toml|sql)$/.test(p) || p.endsWith('Cargo.lock')).sort()
const sourceHashes = Object.fromEntries(sources.map(p => [p, hash(readFileSync(p))]))
const warmup = 3
const repeats = 10
const seed = 0x49524d53
const count = 15000

// 固定種子的微幅角度擾動與接收端時鐘；三種情境均使用同一份角度資料。
let random = seed
const fixture = Array.from({ length: count }, (_, i) => {
  random = (Math.imul(random, 1664525) + 1013904223) >>> 0
  const knee = i % 75 < 40 ? 90 + (random / 2 ** 32 - 0.5) : 0
  return { knee, thigh: 0, shin: 0, kneeRoll: 0, thighRoll: 0, shinRoll: 0,
    rawThigh: 0, rawShin: 0, rawThighRoll: 0, rawShinRoll: 0 }
})

// 最近秩分位數，分母為整次重播，不將批次尾延遲誤稱逐筆 p95。
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = q => sorted[Math.ceil(q * sorted.length) - 1]
  return { runs: values.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95),
    maxMs: sorted.at(-1), meanMs: values.reduce((a, b) => a + b, 0) / values.length }
}

// Zustand 僅需要空白記憶體儲存，不讀真實使用者偏好或檔案。
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
const server = await createServer({ configFile: false, appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false },
  resolve: { alias: { '@shared': path.join(root, 'src/shared'), '@renderer': path.join(root, 'src') } } })
const memoryBefore = process.memoryUsage()
const engineResults = []
try {
  const { TriggerEngine } = await server.ssrLoadModule('/src/services/triggerEngine.ts')
  const { computeMetricSample, computeMetricZone } = await server.ssrLoadModule('/src/services/movementMetric.ts')
  const config = { targetAngle: 90, tolerance: 5, holdTimeMs: 1000, triggerType: 'joint_angle' }
  for (const workload of ['normal', 'dropout', 'catchup']) {
    const durations = []
    let completed = 0
    for (let run = -warmup; run < repeats; run++) {
      let clock = 0
      let reps = 0
      const engine = new TriggerEngine({ onZoneEnter() {}, onZoneExit() {}, onHoldProgress() {},
        onRepCompleted() { reps++ }, onRestCompleted() {}, onOverExtension() {} }, () => clock)
      const started = performance.now()
      for (let i = 0; i < fixture.length; i++) {
        clock += workload === 'catchup' ? (i % 25 === 0 ? 1000 : 0) : 40
        if (workload === 'dropout' && i % 75 === 20) clock += 1000
        engine.handle({ sample: computeMetricSample(fixture[i], config.triggerType, config.tolerance),
          zone: computeMetricZone(config), holdTimeMs: config.holdTimeMs })
      }
      const elapsed = performance.now() - started
      assert.equal(reps, workload === 'normal' ? 200 : 0, `${workload} repetition invariant`)
      if (run >= 0) durations.push(elapsed)
      completed = reps
    }
    const timing = summary(durations)
    engineResults.push({ workload, samples: count, completed, replay: timing,
      meanMicrosecondsPerSample: timing.meanMs * 1000 / count })
  }
} finally {
  await server.close()
}

// 選用原生 debug 基準，沿用正常 Cargo toolchain；不假裝是最佳化 release 效能。
let native = []
if (process.argv.includes('--native')) {
  const output = execFileSync('cargo', ['test', '--manifest-path', 'src-tauri/Cargo.toml',
    'readiness_benchmark', '--', '--ignored', '--nocapture', '--test-threads=1'],
  { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, env: { ...process.env, CARGO_BUILD_JOBS: '1' } })
  native = output.split(/\r?\n/).filter(line => line.includes('IRMS_BENCH:'))
    .map(line => JSON.parse(line.slice(line.indexOf('IRMS_BENCH:') + 'IRMS_BENCH:'.length)))
  assert.equal(native.length, 2, 'expected database and telemetry benchmark records')
}
const result = { schemaVersion: 1, capturedAt: new Date().toISOString(), revision: git('rev-parse', 'HEAD'),
  dirty: git('status', '--porcelain').length > 0, sourceHashes,
  fixture: { algorithm: 'LCG32 / 75 samples per cycle, 40 target + 35 rest', seed, count,
    sha256: hash(JSON.stringify(fixture)), nominalIntervalMs: 40, warmup, repeats },
  environment: { platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model,
    logicalCpus: cpus().length, ramBytes: totalmem(), node: process.version,
    rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
    cargoProfile: 'test/debug (native only)',
    nodeFlags: process.execArgv.filter(flag => ['--jitless', '--no-opt', '--expose-gc'].includes(flag)) },
  engine: engineResults, native,
  memory: { scope: 'Node process with Vite SSR loader; snapshots, not peak or leak proof',
    before: memoryBefore, after: process.memoryUsage() },
  limitations: ['Accelerated synthetic receiver timeline; no paced IO, renderer, IPC, BLE or network benchmark.',
    'No native UI latency/FPS, source timestamp validation, participant data or clinical threshold.',
    'Native output reports actual queue bytes/counts; serialized bytes are not process heap.',
    'No timing CI gate: hardware-dependent baseline; correctness and resource assertions fail the command.'] }
const outIndex = process.argv.indexOf('--output')
const destination = outIndex >= 0 ? process.argv[outIndex + 1] : '../doc/performance/readiness-20261029.json'
assert.ok(destination, '--output requires a path')
mkdirSync(path.dirname(path.resolve(destination)), { recursive: true })
writeFileSync(destination, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ output: destination, engine: engineResults, native }, null, 2))
