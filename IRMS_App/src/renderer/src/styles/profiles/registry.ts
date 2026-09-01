// renderer/styles/profiles/registry.ts
// Single place that lists every available style profile. Adding a new style later is:
// write one `StyleProfile` file next to these two, add it to STYLE_PROFILES below.
import type { StyleProfile } from './types'
import { liquidGlassLight } from './liquidGlassLight'
import { liquidGlassDark } from './liquidGlassDark'

export const STYLE_PROFILES: StyleProfile[] = [liquidGlassLight, liquidGlassDark]

export function getStyleProfile(id: string): StyleProfile | undefined {
  return STYLE_PROFILES.find((p) => p.id === id)
}

/** Union of every token name any profile defines — used to clear all overrides when
 *  falling back to the 'system' (OS-driven, stylesheet-only) appearance. */
export function allProfileTokenNames(): string[] {
  const names = new Set<string>()
  for (const profile of STYLE_PROFILES) {
    for (const name of Object.keys(profile.tokens)) names.add(name)
  }
  return [...names]
}
