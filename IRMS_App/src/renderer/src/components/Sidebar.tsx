// renderer/components/Sidebar.tsx
// 左側導覽欄——唯一的主導覽介面(2026-09-02:依 Gemini 設計判斷移除原本並存的頂部
// SegmentedControl,雙層導覽功能重複又視覺混淆;IRMS UI 設計全權交給 Gemini,見
// memory feedback_irms_ui_design_delegated_to_gemini)。
//
// 2026-09-05:視覺改版依 Gemini 的 nav-rail 規格(doc/gemini-handoff-20260905/02,第二輪
// 逐像素文字規格,取代第一輪失敗的 AI 生圖)——固定寬度導覽軌、捨棄整塊填色的 active
// 狀態改用左側 3px 強調色邊條。刻意保留原本「元件自己讀 useUiStore」的寫法而非改成
// Gemini 範例裡的 props 傳遞(view/onNavigate)——那樣得同步改 App.tsx 的呼叫端,
// 而這個 self-contained hook 模式跟全站其他元件(TopHeader、SessionControlPanel 等)
// 一致,不值得為了這個元件另立一套。
import { useUiStore } from '../store/useUiStore'
import { DashboardIcon, ActionsIcon, HistoryIcon, SettingsIcon } from './NavIcons'

const NAV: { id: 'dashboard' | 'actions' | 'history' | 'settings'; label: string; Icon: typeof DashboardIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { id: 'actions', label: 'Actions', Icon: ActionsIcon },
  { id: 'history', label: 'History', Icon: HistoryIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon }
]

export function Sidebar(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)

  return (
    <nav className="sidebar">
      {/* 標題列已經有完整的 logo+圖示識別,這裡刻意只用文字,不重複放一次圖示
          (見 brief 裡「該不該有自己的識別標記」那題,Gemini 給的答案是要,但用簡約文字)。 */}
      <div className="sidebar-brand">IRMS</div>
      <div className="sidebar-nav-group">
        {NAV.map(({ id, label, Icon }) => {
          const isActive = view === id
          return (
            <button
              key={id}
              className={`sidebar-item${isActive ? ' active' : ''}`}
              onClick={() => setView(id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
