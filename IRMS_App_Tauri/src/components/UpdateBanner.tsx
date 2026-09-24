// 只在「新版本已下載完成」時才顯示——check/available/downloading 全部靜默背景進行,
// 不用系統通知也不用 toast 洗畫面(比照常駐工具的低干擾更新體驗)。
import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { useStore } from '../store/useStore'
import { irms } from '../platform/irmsApi'
import type { UpdateStatus } from '@shared/types'

export function UpdateBanner(): JSX.Element | null {
  const t = useT()
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const sessionRunning = useStore((s) => s.session.running)

  useEffect(() => irms.updates.onStatusChange(setStatus), [])

  if (status?.state !== 'downloaded') return null

  return (
    <div className="update-banner" role="status">
      <span>
        {t.dialogs.updateReady(status.version)}
        {sessionRunning && t.dialogs.updateSessionRunning}
      </span>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={sessionRunning}
        title={sessionRunning ? t.dialogs.updateRestartBlocked : undefined}
        onClick={() => void irms.updates.restartNow()}
      >
        {t.dialogs.restartNow}
      </button>
    </div>
  )
}
