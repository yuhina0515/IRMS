---
tags: [coding-log]
date: 2026-07-12
summary: "Liquid Glass 全面化:背景重設計為色彩 blob 網格(transform-only 慢漂移)、玻璃升級多層鏡面 rim、捲軸玻璃化;參考社群 CSS 實作;71 tests 綠"
---

# 2026-07-12 變更日誌 — Liquid Glass 全面化 + 背景重設計

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260712_liquid_glass|前置:Liquid Glass 初版]]

## 🎯 目的

使用者要求(1)介面全面 Liquid Glass、(2)背景重新設計並參考外部設計。

## 🔍 外部參考(拉取設計手法,非複製)

- CSS-Tricks〈Getting Clarity on Apple's Liquid Glass〉、kube.io〈Liquid Glass in the
  Browser〉、LogRocket 等:正宗配方 = backdrop-filter(blur+saturate)+
  **多層 inset 鏡面 rim**(頂緣強光、全周細內光、底緣暗沉 = 光從上方打)+
  背景需有色彩內容供折射取樣。
- 進階折射(SVG feDisplacementMap 進 backdrop-filter)Chromium 已支援,但
  GPU 開銷大 → **刻意不採用**(本專案剛修完卡頓),列為可選 flourish。
- 官方建議玻璃「用在少數浮動高價值元素」——表格/表單等密集內容區維持素面。

## 🔧 變更內容

1. **背景重設計**(App.tsx + global.css):`.bg-scene` 固定層 + 三顆色彩 blob
   (accent-2 紫/accent 藍/success 綠,radial-gradient 自帶柔邊、不用 filter:blur)、
   90–130s transform-only 慢漂移(合成器層,不觸發重繪)、
   `prefers-reduced-motion` 時停用動畫;body 原漸層移除。
2. **玻璃鏡面升級**:`--glass-highlight` 由單層頂光改三層
   (頂緣 rim + 全周內光 + 底緣內陰影),saturate 1.7→1.8,雙主題各自調校。
3. **捲軸玻璃化**:透明軌道 + `--fill-2` 膠囊 thumb。
4. blob 濃度 token `--blob-opacity`(淺 0.55/深 0.5)。

## ✅ 驗證

- [x] `npm run ci` 全綠:typecheck + 71 tests + build
- [x] `npm run dev` 啟動正常
- [ ] 👀 使用者視覺驗收(淺/深)+ blob 動畫效能體感(理論上 transform-only 零重繪)

## 📝 後續待辦

- 可選 flourish:SVG feDisplacementMap 邊緣折射(限單一元素試點,先量 GPU)
- 依驗收回饋調 blob 顏色/位置/濃度
