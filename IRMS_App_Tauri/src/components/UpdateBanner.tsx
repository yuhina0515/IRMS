// renderer/components/UpdateBanner.tsx
// 只在「新版本已下載完成」時才顯示——check/available/downloading 全部靜默背景進行,
// 不用系統通知也不用 toast 洗畫面。這是刻意的低干擾設計:比照 VS Code/Slack 這類
// 常駐工具的更新體驗,而不是強迫使用者面對一個安裝精靈。
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { irms } from '../platform/irmsApi'
import type { UpdateStatus } from '@shared/types'
import { useT } from '../i18n'

export function UpdateBanner(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const sessionRunning = useStore((s) => s.session.running)
  const m = useT()

  useEffect(() => irms.updates.onStatusChange(setStatus), [])

  if (status?.state !== 'downloaded') return null

  return (
    <div className="update-banner" role="status">
      <span>
        {m.updateBanner.ready({ version: status.version })}
        {sessionRunning && m.updateBanner.sessionNote}
      </span>
      <button
        className="btn btn-primary btn-sm"
        disabled={sessionRunning}
        title={sessionRunning ? m.updateBanner.restartBlocked : undefined}
        onClick={() => void irms.updates.restartNow()}
      >
        {m.updateBanner.restartNow}
      </button>
    </div>
  )
}
