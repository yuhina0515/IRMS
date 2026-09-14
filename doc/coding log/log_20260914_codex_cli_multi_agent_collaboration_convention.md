---
tags: [coding-log, docs, convention]
summary: 使用者告知 Codex CLI 已在這台機器上線,要求它與 Claude Code 互相尊重與協作。新增 AI_CODING_RULES.md §1.2「多 AI 代理協作」,明訂沒有共享 session 的多個代理間該怎麼透過 git/coding log 溝通、開工前先查有無未預期變更、不要不明就裡回退對方的決定。純文件變更。
date: 2026-09-14
---

# 2026-09-14 Codex CLI 多代理協作慣例

> **相關文件**:[[HOME|導覽首頁]] · [[AI_CODING_RULES|編碼規範]]

## 🎯 目的

使用者說「Codex CLI 已經上線，請兩個互相尊重與協作」。這台機器已經同時裝了 Claude Code、
Gemini/Antigravity CLI(§1.1 設計權責的對象)、現在又加上 Codex CLI,三者彼此沒有共享的
即時 session,需要一個明確的協作慣例避免互相覆寫或踩到對方的工作。

## 🔧 變更內容

`doc/AI_CODING_RULES.md` 新增 §1.2「多 AI 代理協作」,緊接在 §1.1 設計權責之後:

- 開工前用 `git status`/`git log` 確認沒有另一個代理留下的未預期變更(既有 git safety
  protocol 的延伸解讀,不是新規則)。
- 發現另一個代理的變更看起來奇怪,先讀對應的 coding log/commit message 理解理由,再判斷
  是否調整——不要不明就裡直接回退。
- 會影響後續工作的決定,寫進 commit message 跟 coding log,不依賴使用者口頭轉述給另一個
  代理。
- 明確劃清:這跟 §1.1(美術/UI 判斷單向委任給 Gemini)是不同範疇,不要混為一談——這裡談的
  是工程協作的一般禮貌。

純文件變更,沒有程式碼影響。

## ✅ 驗證方式

- [x] 純文件新增,無程式碼變更、無需編譯測試——人工核對新增段落與既有 §1.1 的格式/語氣一致

## 📝 後續待辦

- 目前只有原則性文字,沒有具體工具(例如某種鎖檔機制)。如果之後真的發生多代理同時改同一批
  檔案造成衝突,再視實際狀況補流程,不預先過度設計。
