// renderer/components/ErrorBoundary.tsx
// --- 崩潰隔離 ---
//
// App 原本沒有任何 ErrorBoundary,任一 view 在 render 時拋錯,React 18 會卸載整棵樹
// → 整個視窗空白。而 sessionController 是模組層級的 singleton(main.tsx 匯入時就建立),
// 它持有 BLE 通知回呼、flush 計時器與時鐘計時器——這些都在 React 之外,白屏之後仍
// continue 運作。使用者沒有任何按鈕可按,只能從工作管理員強殺,於是進行中的 Session
// 變成孤兒列。
//
// 因此 fallback 一定要提供「結束並儲存 Session」,這是白屏當下唯一能保住資料的動作。
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { SessionSaveControl } from './SessionSaveControl'
import { useStore } from '../store/useStore'
import { getT } from '../i18n'

interface Props {
  /** 出錯區塊的名稱,顯示給使用者也寫進 log */
  name: string
  children: ReactNode
}

interface State {
  error: Error | null
}

// 錯誤邊界本身不依賴 store 重繪，療程提示需獨立訂閱以免存檔後仍稱正在執行。
function SessionRunningNote(): JSX.Element | null {
  const running = useStore((s) => s.session.running)
  return running ? <>{getT().errorBoundary.running}</> : null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    useStore.getState().log(`💥 ${this.props.name} crashed: ${error.message}`)
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info.componentStack)
  }

  private reset = (): void => this.setState({ error: null })

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    // Class component, so no hooks: App re-renders on a language change and that re-renders this
    // fallback too, so reading the dictionary at render time is enough.
    const m = getT()
    return (
      <div className="panel glass error-boundary">
        <h3>{m.errorBoundary.title}</h3>
        <p>
          {m.errorBoundary.body({ name: this.props.name })}
          <SessionRunningNote />
        </p>
        <pre className="error-boundary-detail">{error.message}</pre>
        <div className="row" style={{ gap: 10 }}>
          <SessionSaveControl allowEnd />
          <button className="btn" onClick={this.reset}>
            {m.common.retry}
          </button>
        </div>
      </div>
    )
  }
}
