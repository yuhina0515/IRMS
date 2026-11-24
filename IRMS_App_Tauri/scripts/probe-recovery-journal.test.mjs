import { it, expect, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, basename, sep } from 'node:path'
import { spawnSync } from 'node:child_process'

const moduleUrl = new URL('./probe-recovery-journal.mjs', import.meta.url).href
let directory
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'irms-journal-errors-')) })
afterEach(() => {
  // 遞迴清除前確認只有本測試自行建立的暫存目錄。
  const target = resolve(directory)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('irms-journal-errors-')) throw new Error('Unsafe cleanup')
  rmSync(target, { recursive: true, force: true })
})
it.each(['setup', 'output', 'cleanup'])('redacts native %s failures and exits unsuccessfully', phase => {
  const input = join(directory, 'private-missing-parent', 'private-input')
  const operation = phase === 'setup' ? 'statSync(input)' : phase === 'output' ? 'writeFileSync(input,"synthetic")' : 'rmSync(input)'
  const script = `import {runWithRedactedErrors} from ${JSON.stringify(moduleUrl)};
    import {statSync,writeFileSync,rmSync} from 'node:fs';
    const input=process.argv[1]; process.exitCode=await runWithRedactedErrors(async()=>{${operation};return 0});`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, input], { encoding: 'utf8', timeout: 10000 })
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr.trim()).toBe('Journal probe infrastructure failure')
  expect(result.stderr).not.toContain('private')
})
