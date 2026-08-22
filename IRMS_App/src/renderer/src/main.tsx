// renderer/main.tsx
// --- React 進入點 ---
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useStore } from './store/useStore'
// 匯入即會實例化單例,完成 bluetooth ↔ sessionController 的接線
import './services/sessionController'
// SF Pro 是 Apple 授權字型,不能合法包進 Windows build;Inter 是視覺上最接近的
// 開源替身(SIL OFL),自架避免使用者本機沒裝就整組 fallback 掉到 Segoe UI。
// 只引入 wght 軸(不含斜體)——App 全程沒有 italic 文字,index.css 全量會多帶
// 用不到的 italic 子集。
import '@fontsource-variable/inter/wght.css'
import './styles/global.css'

// 啟動時載入自訂動作清單
async function bootstrap(): Promise<void> {
  try {
    const actions = await window.irms.actions.list()
    useStore.getState().setCustomActions(actions)
    // 預設選取目前協定下的第一個動作
    const protocol = useStore.getState().settings.protocol
    const first = actions.find((a) => a.protocol === protocol)
    useStore.getState().selectAction(first ? first.id : null)
  } catch (err) {
    useStore.getState().log(`Failed to load actions: ${(err as Error).message}`)
  }
}

void bootstrap()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
