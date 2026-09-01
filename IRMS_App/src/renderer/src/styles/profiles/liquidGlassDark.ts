// renderer/styles/profiles/liquidGlassDark.ts
// Dark half of the original Apple Liquid Glass theme, extracted verbatim from the
// `@media (prefers-color-scheme: dark)` override that used to be the only source of
// truth in global.css — merged onto the light values for tokens dark never overrode
// (--radius/--glass-blur/--font/--console-text and the color-mix() formulas), since a
// profile here must be complete on its own, not depend on falling through to another one.
import type { StyleProfile } from './types'

export const liquidGlassDark: StyleProfile = {
  id: 'liquid-glass-dark',
  name: 'Liquid Glass — 深色',
  description: 'Apple 風格液態玻璃材質,深色配色。',
  tokens: {
    '--bg-0': '#0b0f1f',
    '--surface': 'rgba(38, 44, 66, 0.5)',
    '--surface-2': 'rgba(255, 255, 255, 0.06)',
    '--text': '#ffffff',
    '--text-dim': '#9a9aa2',
    '--separator': 'rgba(255, 255, 255, 0.1)',
    '--glass-border': 'rgba(255, 255, 255, 0.14)',
    '--glass-highlight':
      'inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 -12px 24px -18px rgba(0, 0, 0, 0.4)',
    '--fill': 'rgba(120, 120, 128, 0.22)',
    '--fill-2': 'rgba(120, 120, 128, 0.34)',

    '--accent': '#0a84ff',
    '--accent-2': '#5e5ce6',
    '--success': '#30d158',
    '--warning': '#ff9f0a',
    '--danger': '#ff453a',
    '--thigh': '#ff9f0a',
    '--shin': '#30d158',
    '--roll': '#bf5af2',

    '--radius': '18px',
    '--glass-blur': 'blur(30px) saturate(1.8)',
    '--blob-opacity': '0.18',
    '--shadow-card': '0 8px 28px rgba(0, 0, 0, 0.45)',
    '--font':
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter Variable', system-ui, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', sans-serif",

    '--glass-elevated-sheen':
      'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)',
    '--glass-elevated-border-top': 'rgba(255, 255, 255, 0.2)',
    '--glass-elevated-border-bottom': 'rgba(0, 0, 0, 0.4)',
    '--glass-elevated-shadow':
      '0 12px 48px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',

    '--console-bg': 'rgba(10, 12, 18, 0.7)',
    '--console-text': '#32d74b',
    '--gauge-track': 'rgba(160, 160, 175, 0.25)',
    '--gauge-band': 'color-mix(in srgb, var(--success) 28%, transparent)',
    '--ring-track': 'rgba(160, 160, 175, 0.25)',
    '--ring-idle': 'rgba(160, 160, 175, 0.4)',
    '--arc-idle': 'color-mix(in srgb, var(--accent) 40%, transparent)',
    '--chart-grid': 'rgba(255, 255, 255, 0.08)',
    '--chart-tick': '#9a9aa2',
    '--chart-text': '#ffffff',
    '--leg3d-bg': '#12172a',
    '--leg3d-grid-major': '#3a4260',
    '--leg3d-grid-minor': '#232a44'
  }
}
