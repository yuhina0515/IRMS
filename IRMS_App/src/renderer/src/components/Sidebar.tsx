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
//
// 2026-09-06:使用者要求把原本的「IRMS」文字識別換成收合按鈕——按下後選單按鈕旋轉、
// 側邊欄收合成僅剩圖示的窄軌。收合狀態刻意用純本地 useState(不寫進 useStore/
// settings persist)——這是暫態的畫面偏好,不是需要跨重啟記住的設定,沒有使用者
// 要求持久化就不擴大範圍。標籤文字收合時不特別做 fade 動畫,靠 .sidebar 本身的
// overflow:hidden 在寬度變窄時自然裁切——比另外寫一組 opacity/width 動畫简单,
// 效果也一致(見 tailwind.css 的 .sidebar 規則)。
//
// 旋轉後續澄清(同日):不是「收合時停在旋轉後的角度」(第一版這樣做,3 條水平線轉
// 90 度變成 3 條直線,使用者反應難看),而是「每次按下都轉一圈 360 度」——起訖角度
// 相同,純粹是按下當下的一次性動畫回饋,不是狀態指示。用 spinKey 遞增 + React key
// 強制重掛載來每次都重播動畫(CSS animation 若 class 沒有真的從 DOM 移除又重新加入,
// 同一個 animation-name 不會重新觸發;重掛載是最直接不會踩空的做法)。hasSpun 額外
// 判斷則是避免使用者根本還沒按過,App 一啟動 icon 就跟著轉一圈。
import { useState } from 'react'
import { useUiStore } from '../store/useUiStore'
import { DashboardIcon, ActionsIcon, HistoryIcon, SettingsIcon, MenuIcon } from './NavIcons'

const NAV: { id: 'dashboard' | 'actions' | 'history' | 'settings'; label: string; Icon: typeof DashboardIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { id: 'actions', label: 'Actions', Icon: ActionsIcon },
  { id: 'history', label: 'History', Icon: HistoryIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon }
]

export function Sidebar(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const [collapsed, setCollapsed] = useState(false)
  const [spinKey, setSpinKey] = useState(0)
  const hasSpun = spinKey > 0

  const toggle = (): void => {
    setCollapsed((c) => !c)
    setSpinKey((k) => k + 1)
  }

  return (
    <nav className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <button
        type="button"
        className="sidebar-toggle"
        aria-label={collapsed ? '展開選單' : '收起選單'}
        aria-expanded={!collapsed}
        onClick={toggle}
      >
        <span key={spinKey} className={`sidebar-toggle-icon${hasSpun ? ' spin' : ''}`}>
          <MenuIcon size={20} />
        </span>
      </button>
      <div className="sidebar-nav-group">
        {NAV.map(({ id, label, Icon }) => {
          const isActive = view === id
          return (
            <button
              key={id}
              className={`sidebar-item${isActive ? ' active' : ''}`}
              onClick={() => setView(id)}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? label : undefined}
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
