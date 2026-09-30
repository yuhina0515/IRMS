// test/locale.ts
// --- 兩個 vitest project 共用的語系釘選 ---
// 預設語系設定是 'system',會讀 navigator.languages。jsdom 固定回報 en-US,Node 則跟隨
// 執行機器的 ICU 預設(CI 的 Windows runner 是 en-US,開發機是 zh-TW)——不釘住的話,
// 同一組斷言繁中字串的既有測試會「在我電腦上綠、在 CI 上紅」。
// 需要測系統語系解析的測試自行以 vi.stubGlobal / 傳入 tags 覆寫,不受這裡影響。
Object.defineProperty(globalThis.navigator, 'languages', { value: ['zh-TW'], configurable: true })
Object.defineProperty(globalThis.navigator, 'language', { value: 'zh-TW', configurable: true })
