// renderer/components/UpdateBanner.tsx
// 下載完成後顯示；使用者啟動安裝後保留進度與可重試錯誤。
// check/available/downloading 全部靜默背景進行,
// 不用系統通知也不用 toast 洗畫面。這是刻意的低干擾設計:比照 VS Code/Slack 這類
// 常駐工具的更新體驗,而不是強迫使用者面對一個安裝精靈。
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { irms } from '../platform/irmsApi'
import type { UpdateStatus } from '@shared/types'
import { useT } from '../i18n'

export function UpdateBanner(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const sessionRunning = useStore((s) => s.session.running || s.session.id != null)
  const m = useT()

  useEffect(() => irms.updates.onStatusChange(setStatus), [])

  const restart = async (): Promise<void> => {
    try { await irms.updates.restartNow() } catch {
      // 平台已發布 install-error；保留原下載及明確重試，避免未處理的 Promise 拒絕。
    }
  }

  if (status?.state === 'apk-available') {
    return (
      <div className="update-banner" role="status">
        <span>{m.updateBanner.apkReady({ version: status.version })}</span>
        <button className="btn btn-primary btn-sm" onClick={() => void irms.updates.openApkDownload()}>
          {m.updateBanner.apkDownload}
        </button>
      </div>
    )
  }
  if (status?.state !== 'downloaded' && status?.state !== 'installing' && status?.state !== 'install-error') return null
  const installing = status.state === 'installing'

  return (
    <div className="update-banner">
      <span>
        {/* 兩個持續存在的區域分開通知，錯誤不再混入 polite 狀態重複報讀。 */}
        <span role="status" aria-atomic="true">
          {installing ? m.updateBanner.installing : m.updateBanner.ready({ version: status.version })}
          {!installing && sessionRunning && m.updateBanner.sessionNote}
        </span>
        <span role="alert" aria-atomic="true">
          {status.state === 'install-error' ? ` ${m.updateBanner.installFailed}` : ''}
        </span>
      </span>
      <button
        className="btn btn-primary btn-sm"
        disabled={sessionRunning || installing}
        title={sessionRunning ? m.updateBanner.restartBlocked : undefined}
        onClick={() => void restart()}
      >
        {m.updateBanner.restartNow}
      </button>
    </div>
  )
}
