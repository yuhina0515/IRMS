---
tags: [coding-log]
date: 2026-07-04
summary: "Dashboard 新增 Three.js 3D 即時姿態視圖(Pitch+Roll 雙軸驅動、OrbitControls、膝關節狀態變色),與 2D 弧線圖可切換"
---

# 2026-07-04 變更日誌 — 3D 即時姿態視圖

> **相關文件**:[[HOME|導覽首頁]] · [[ROADMAP|架構與代碼計畫]]

## 🎯 目的

使用者需求:「建立一個三維空間,讓 App 可以看到目前的真實狀態」。
2D 弧線圖只能呈現矢狀面;3D 視圖同時呈現 Pitch(前後)與 Roll(內外翻)。

## 🔧 變更內容

- 新增 `components/Leg3D.tsx`(Three.js 0.185):
  - 大腿/小腿圓柱肢段 + 髖/膝/踝關節球,感測器 Pitch/Roll 即時驅動。
  - 小腿掛場景層級用**絕對姿態角**,每幀將位置對齊膝點,免相對旋轉換算。
  - OrbitControls 拖曳視角/縮放;rAF 命令式更新(同 LiveChart 策略,不經 React 重繪)。
  - 膝關節球狀態色:藍(一般)/ 綠(inZone)/ 紅(硬體錯誤);ERR 時凍結姿態。
- `DashboardView` 姿態面板加 3D/2D 切換(預設 3D,保留原 AngleVisualizer)。
- 依賴:`three` + `@types/three`。

## ⚠ 已知限制

- MPU6050 無磁力計 → **Yaw(水平轉向)不可測**,模型固定朝向;需 9 軸感測器才能解。

## ✅ 驗證方式

- [x] typecheck / 22 tests / HMR 載入通過
- [ ] 📡 實機:擺動方向與實際一致(方向反了調 `Leg3D` 內 `d2r()` 符號或 Settings 反相)
