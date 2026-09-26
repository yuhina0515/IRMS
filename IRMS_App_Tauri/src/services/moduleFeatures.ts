import type { AutoUpdateDeps } from './firmwareAutoUpdate'
import type { MetricPoint, SessionAnalysis } from './sessionAnalysis'
import type { MetricZone } from './movementMetric'

export type FirmwareUpdaterFactory = (deps: AutoUpdateDeps) => { run(): Promise<void> }
export type SessionAnalyzer = (points: MetricPoint[], zone: MetricZone | null) => SessionAnalysis
export interface FeatureProviders {
  firmwareUpdater?: FirmwareUpdaterFactory
  sessionAnalyzer?: SessionAnalyzer
}
const providers = new Map<string, FeatureProviders>()
export function commitFeatures(id: string, features: FeatureProviders): void { providers.set(id, features) }
export function removeFeatures(id: string): void { providers.delete(id) }
export function firmwareUpdaterFactory(): FirmwareUpdaterFactory | undefined { return providers.get('firmware-updater')?.firmwareUpdater }
export function sessionAnalyzer(): SessionAnalyzer | undefined { return providers.get('session-analysis')?.sessionAnalyzer }
