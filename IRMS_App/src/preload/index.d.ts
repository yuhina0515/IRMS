// preload/index.d.ts
// 將 window.irms 的型別注入 renderer 的全域 Window。
import type { IrmsApi } from '@shared/types'

declare global {
  interface Window {
    irms: IrmsApi
  }
}

export {}
