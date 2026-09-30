import type { AutoUpdateDeps } from './firmwareAutoUpdate'
import type { MetricPoint, SessionAnalysis } from './sessionAnalysis'
import type { MetricZone } from './movementMetric'

export type FirmwareUpdaterFactory = (deps: AutoUpdateDeps) => { run(): Promise<void> }
export type SessionAnalyzer = (points: MetricPoint[], zone: MetricZone | null) => SessionAnalysis
/**
 * 模組在「工具」頁畫的操作介面(設定 → 模組只做管理)。模組不能 import React,
 * 所以拿到的是一個空的 DOM 容器;回傳的函式在離開頁面或停用模組時呼叫。
 */
export interface ModulePanel {
  mount(el: HTMLElement): void | (() => void)
}
export interface ModulePage extends ModulePanel { title: string }
export interface FeatureProviders {
  firmwareUpdater?: FirmwareUpdaterFactory
  sessionAnalyzer?: SessionAnalyzer
  page?: ModulePage
}
const providers = new Map<string, FeatureProviders>()
export function commitFeatures(id: string, features: FeatureProviders): void { providers.set(id, features) }
export function removeFeatures(id: string): void { providers.delete(id) }
export function firmwareUpdaterFactory(): FirmwareUpdaterFactory | undefined { return providers.get('firmware-updater')?.firmwareUpdater }
export function modulePage(id: string): ModulePage | undefined { return providers.get(id)?.page }
export function sessionAnalyzer(): SessionAnalyzer | undefined { return providers.get('session-analysis')?.sessionAnalyzer }
