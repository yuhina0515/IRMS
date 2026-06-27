// renderer/main.tsx
// --- React 進入點 ---
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useStore } from './store/useStore'
// 匯入即會實例化單例,完成 bluetooth ↔ sessionController 的接線
import './services/sessionController'
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
