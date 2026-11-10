// 存檔失敗時保留停止的療程，讓一般畫面與錯誤遮罩共用重試入口。
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { sessionController } from '../services/sessionController'
import { useT } from '../i18n'

export function SessionSaveControl({ allowEnd = false }: { allowEnd?: boolean }): JSX.Element | null {
  const session = useStore((s) => s.session)
  const state = useStore((s) => s.sessionSaveState)
  const m = useT()
  if ((session.id == null && !session.running) || (session.running && !allowEnd)) return null

  const save = async (): Promise<void> => {
    const saved = await sessionController.endSession()
    if (saved) useUiStore.getState().showToast(m.sessionDock.ended, 'success')
  }

  return (
    <div>
      {state === 'failed' && <p role="alert">{m.sessionDock.saveFailed}</p>}
      <button className="btn btn-primary" disabled={state === 'saving'} onClick={() => void save()}>
        {state === 'saving' ? m.sessionDock.blocker.finishing : session.running ? m.common.endAndSaveSession : m.sessionDock.retrySave}
      </button>
    </div>
  )
}
