// Vitest 設定(Tauri port of IRMS_App/vitest.config.ts):兩個 project,以副檔名分流。
//
// 為什麼不是單一設定:原本(Electron 側)是 `include: ['src/**/*.test.ts']` +
// `environment: 'node'`。那個 glob **不匹配 .tsx**,所以一個元件測試檔會被
// 「靜默忽略」而不是失敗——寫了、沒跑、全綠,是測試基建最危險的失效模式。改成
// 兩個 project 之後,副檔名本身就是選擇器:.test.tsx 一定落在 dom project,
// 不可能無聲消失。這裡原封不動搬過來,理由沒有變過。
//
// node project 刻意不掛 setupFiles,讓純函式測試(triggerEngine / protocol /
// calibration / sessionController 的指令稽核…)的環境維持最小、不背 DOM 的包袱。
//
// environment 選 jsdom 而非 happy-dom:本專案的臨床輸出面正好踩在 happy-dom 的弱項上
// ——CSV 匯出走 Blob + URL.createObjectURL + a.click()(HistoryView),主題偵測走
// matchMedia(theme.ts)。兩者都沒有 canvas 2D context,所以碰圖表的測試一律要
// vi.mock('chart.js'),這點換 environment 也救不了,那就選保真度高的那個。
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// 與 vite.config.ts / tsconfig.json 的 paths 對齊:Tauri 側沒有 Electron 那層
// src/renderer/src 巢狀結構,@renderer 就是 src 本身,@shared 是 src/shared。
const alias = {
  '@renderer': fileURLToPath(new URL('./src', import.meta.url)),
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url))
}

export default defineConfig({
  test: {
    projects: [
      {
        // 純邏輯層(triggerEngine / protocol / calibration / sessionController 的
        // 指令稽核 / bluetoothService 的重連迴圈…)
        resolve: { alias },
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          environment: 'node'
        }
      },
      {
        // 元件層。plugins: [react()] 不是可選的,理由同 Electron 側原始註解:
        // 根 tsconfig 是 files: [] + references,esbuild 的 JSX pragma 解析在此不可靠。
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'dom',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts']
        }
      }
    ]
  }
})
