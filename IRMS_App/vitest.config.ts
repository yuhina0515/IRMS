// Vitest 設定:純邏輯單元測試(triggerEngine / protocol / store 純函式)。
// alias 與 electron.vite.config.ts 的 @shared 對齊。
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
