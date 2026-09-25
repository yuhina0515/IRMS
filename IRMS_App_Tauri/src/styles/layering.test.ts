// Guards CSS stacking order that jsdom cannot observe: a portaled dropdown opened from inside
// a modal must render above the modal's .overlay backdrop (2026-09-25 real-app report: the
// Create Action Trigger Type dropdown "did not expand" because it opened behind the overlay).
//
// Reads the source file directly: under vitest, `./tailwind.css?raw` resolves to an empty
// string (CSS is not processed in tests), so a Vite import cannot see the rules.
// @ts-expect-error -- the renderer tsconfig ships no Node types; this test runs in the node project
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css: string = readFileSync(new URL('./tailwind.css', import.meta.url), 'utf8')

function zOf(selector: string): number {
  const block = css.match(new RegExp(`\\n\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))
  const z = block?.[1].match(/z-\[(\d+)\]/)
  if (!z) throw new Error(`no z-[n] found for ${selector}`)
  return Number(z[1])
}

describe('CSS layering', () => {
  it('dropdown popup stacks above modal overlay', () => {
    expect(zOf('.glass-dropdown-popup')).toBeGreaterThan(zOf('.overlay'))
  })
})
