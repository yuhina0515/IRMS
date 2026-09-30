// vite.browsertest.config.ts — 純瀏覽器測試用(不進 build,不進版控意圖上不影響 electron-vite)。
// electron.vite.config.ts 的 defineConfig() 回傳 {main,preload,renderer} 三段式物件,
// 一般 `vite` CLI 讀不懂;這裡把 renderer 那段設定原樣抽出來,讓純 Chromium 分頁能
// 直接打 localhost 測 CSS/版面,不需要啟動 Electron(2026-08-07 會議裁決的瀏覽器測試工作流)。
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [react()]
})
