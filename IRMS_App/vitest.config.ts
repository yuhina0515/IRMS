// Vitest 設定:兩個 project,以副檔名分流。
//
// 為什麼不是單一設定:原本是 `include: ['src/**/*.test.ts']` + `environment: 'node'`。
// 那個 glob **不匹配 .tsx**,所以一個元件測試檔會被「靜默忽略」而不是失敗——
// 寫了、沒跑、全綠,是測試基建最危險的失效模式。改成兩個 project 之後,
// 副檔名本身就是選擇器:.test.tsx 一定落在 dom project,不可能無聲消失。
//
// 同時 node project 的設定與 2026-08-27 之前逐字相同,既有 173 個純函式測試
// 看到的環境沒有任何變化(尤其不會被迫跑 DOM 的 setupFiles)。
//
// environment 選 jsdom 而非 happy-dom:本專案的臨床輸出面正好踩在 happy-dom 的弱項上
// ——CSV 匯出走 Blob + URL.createObjectURL + a.click()(HistoryView),主題偵測走
// matchMedia(theme.ts)。兩者都沒有 canvas 2D context,所以碰圖表的測試一律要
// vi.mock('chart.js'),這點換 environment 也救不了,那就選保真度高的那個。
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// tsconfig.web.json 的 paths 已定義這兩個別名,測試端必須對齊,
// 否則 import '@renderer/...' 在 typecheck 過得了、在 vitest 解析不到。
const alias = {
  '@renderer': resolve(__dirname, 'src/renderer/src'),
  '@shared': resolve(__dirname, 'src/shared')
}

export default defineConfig({
  test: {
    projects: [
      {
        // 純邏輯層(triggerEngine / protocol / calibration / migrations / sessionController…)
        resolve: { alias },
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          environment: 'node'
        }
      },
      {
        // 元件層。plugins: [react()] 不是可選的——根 tsconfig 是 files: [] + references,
        // esbuild 的 JSX pragma 解析在此不可靠;vite.browsertest.config.ts 已驗證這個形狀可行。
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'dom',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./src/renderer/src/test/setup.ts']
        }
      }
    ]
  }
})
