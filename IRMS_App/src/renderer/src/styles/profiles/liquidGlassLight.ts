// renderer/styles/profiles/liquidGlassLight.ts
// Light half of the original Apple Liquid Glass theme, extracted verbatim from the
// `:root` block that used to be the only source of truth in global.css.
import type { StyleProfile } from './types'

export const liquidGlassLight: StyleProfile = {
  id: 'liquid-glass-light',
  name: 'Liquid Glass — 淺色',
  description: 'Apple 風格液態玻璃材質,淺色配色。',
  tokens: {
    '--bg-0': '#eef2fb',
    '--surface': 'rgba(255, 255, 255, 0.58)',
    '--surface-2': 'rgba(255, 255, 255, 0.5)',
    '--text': '#1c1c1e',
    '--text-dim': '#5d5d63',
    '--separator': 'rgba(60, 60, 67, 0.12)',
    '--glass-border': 'rgba(255, 255, 255, 0.55)',
    '--glass-highlight':
      'inset 0 1px 0 rgba(255, 255, 255, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.18), inset 0 -12px 24px -18px rgba(31, 38, 60, 0.25)',
    '--fill': 'rgba(120, 120, 128, 0.1)',
    '--fill-2': 'rgba(120, 120, 128, 0.18)',

    '--accent': '#007aff',
    '--accent-2': '#5856d6',
    '--success': '#34c759',
    '--warning': '#ff9500',
    '--danger': '#ff3b30',
    '--thigh': '#ff9500',
    '--shin': '#34c759',
    '--roll': '#af52de',

    '--radius': '18px',
    '--glass-blur': 'blur(30px) saturate(1.8)',
    '--blob-opacity': '0.22',
    '--shadow-card': '0 8px 24px rgba(31, 38, 60, 0.12)',
    '--font':
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter Variable', system-ui, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', sans-serif",

    '--glass-elevated-sheen':
      'linear-gradient(135deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.15) 100%)',
    '--glass-elevated-border-top': 'rgba(255, 255, 255, 0.7)',
    '--glass-elevated-border-bottom': 'rgba(0, 0, 0, 0.12)',
    '--glass-elevated-shadow':
      '0 12px 40px -12px rgba(31, 38, 60, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.5)',

    '--console-bg': 'rgba(18, 18, 22, 0.85)',
    '--console-text': '#32d74b',
    '--gauge-track': 'rgba(120, 120, 128, 0.18)',
    '--gauge-band': 'color-mix(in srgb, var(--success) 28%, transparent)',
    '--ring-track': 'rgba(120, 120, 128, 0.18)',
    '--ring-idle': 'rgba(120, 120, 128, 0.32)',
    '--arc-idle': 'color-mix(in srgb, var(--accent) 40%, transparent)',
    '--chart-grid': 'rgba(0, 0, 0, 0.06)',
    '--chart-tick': '#5d5d63',
    '--chart-text': '#1c1c1e',
    '--leg3d-bg': '#e2e7f2',
    '--leg3d-grid-major': '#bcc4d4',
    '--leg3d-grid-minor': '#d3dae6'
  }
}
