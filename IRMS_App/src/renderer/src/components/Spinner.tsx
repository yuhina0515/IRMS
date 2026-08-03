// renderer/components/Spinner.tsx
// 讀取中指示器。IPC 讀取(History 列表、單場分析、CSV 匯出)是唯一一批完全無回饋的
// 非同步操作——見 HistoryView.tsx 的 AnalysisModal 註解「會讓這個 modal 明顯卡住」。
export function Spinner({ label }: { label?: string }): JSX.Element {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      {label && <span>{label}</span>}
    </div>
  )
}
