// --- 即時角度 EMA 平滑 ---
// 接在 applyCalibration 之後、判定與顯示之前:韌體互補濾波在動作中仍會殘留
// 加速度計雜訊,這裡以指數移動平均收斂,判定引擎與畫面吃同一份平滑值。
// 平滑基礎肢段角(thigh/shin/roll),衍生角(knee/kneeRoll)由平滑值重算,
// 確保「knee = |thigh − shin|」的恆等式在平滑後仍成立。
// raw* 欄位直接透傳(校準精靈需要未平滑的原始值做 stdDev 驗證)。
import type { LiveAngles } from '@shared/protocol'

/** EMA 新樣本權重:25Hz 資料流下時間常數約 0.12s,肉眼無感延遲但足以壓住抖動 */
export const EMA_ALPHA = 0.3

export class AngleSmoother {
  private thigh = 0
  private shin = 0
  private thighRoll = 0
  private shinRoll = 0
  private seeded = false

  constructor(private readonly alpha: number = EMA_ALPHA) {}

  /** 清除濾波狀態(斷線、硬體錯誤時呼叫,防止復原後由舊狀態拖出假角度) */
  reset(): void {
    this.seeded = false
  }

  next(a: LiveAngles): LiveAngles {
    if (!this.seeded) {
      this.thigh = a.thigh
      this.shin = a.shin
      this.thighRoll = a.thighRoll
      this.shinRoll = a.shinRoll
      this.seeded = true
    } else {
      this.thigh += this.alpha * (a.thigh - this.thigh)
      this.shin += this.alpha * (a.shin - this.shin)
      this.thighRoll += this.alpha * (a.thighRoll - this.thighRoll)
      this.shinRoll += this.alpha * (a.shinRoll - this.shinRoll)
    }
    return {
      ...a,
      thigh: this.thigh,
      shin: this.shin,
      thighRoll: this.thighRoll,
      shinRoll: this.shinRoll,
      knee: Math.abs(this.thigh - this.shin),
      kneeRoll: this.shinRoll - this.thighRoll
    }
  }
}
