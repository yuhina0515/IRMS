/** @type {import('tailwindcss').Config} */
// Design tokens (craft-ui-designer skill) — data-console / bento-grid direction.
// 2026-09-02: colors now resolve through CSS custom properties (defined per-theme in
// tailwind.css) instead of fixed hex values, so the same semantic class names
// (bg-canvas, text-text, border-accent, ...) work under both the dark "Data-Console" and
// light "Precision Lab" themes from the external design handoff (doc/gemini-handoff-20260902/)
// — see tailwind.css for the actual `--color-*` values per theme and the toggle mechanism.
// The `<alpha-value>` placeholder is Tailwind's standard hook for opacity modifiers
// (e.g. `border-accent/40`) to keep working against a CSS-var-backed color.
function withOpacity(varName) {
  return `rgb(var(${varName}) / <alpha-value>)`
}

module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: withOpacity('--color-canvas'),
        surface: withOpacity('--color-surface'),
        'surface-raised': withOpacity('--color-surface-raised'),
        border: withOpacity('--color-border'),
        text: withOpacity('--color-text'),
        'text-dim': withOpacity('--color-text-dim'),
        'text-muted': withOpacity('--color-text-muted'),
        accent: withOpacity('--color-accent'),
        'accent-strong': withOpacity('--color-accent-strong'),
        success: withOpacity('--color-success'),
        warning: withOpacity('--color-warning'),
        danger: withOpacity('--color-danger')
      },
      fontFamily: {
        // sans reuses the Inter Variable already self-hosted via @fontsource-variable/inter
        // (main.tsx) — no new font pipeline needed for UI chrome text.
        sans: ['Inter Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // mono is for numeric/data readouts (angles, reps, timers) — a data-console interface
        // gives measured values their own distinct typeface from UI chrome, per the external
        // design handoff's "typography does 50% of the instrument-vs-wellness-app work" note.
        // Self-hosted via @fontsource-variable/jetbrains-mono (main.tsx), same pattern as Inter.
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      boxShadow: {
        // Reserved for genuinely floating layers (dropdown/dialog) — bento cards get elevation
        // from the surface/surface-raised color step + border, not a shadow.
        floating: '0 8px 30px rgba(0, 0, 0, 0.45)',
        // "Lighting" from the design handoff: active/ON elements get a soft glow instead of
        // reading as a flat rounded box. Dark theme only in practice (see tailwind.css) — a
        // glow on a white canvas would just look like a blur artifact, not an instrument light.
        'glow-accent': '0 0 12px 2px rgb(var(--color-accent) / 0.35)',
        'glow-success': '0 0 12px 2px rgb(var(--color-success) / 0.35)'
      },
      borderRadius: {
        // Refined per the external design handoff (was 1rem/0.5rem) — tighter radii read as
        // more "instrument," less "soft app." Same values for both themes; the handoff's two
        // mockups suggested slightly different radii per theme (12/6 vs 8/4) but the gap is
        // minor and not worth doubling the token surface for — see coding log for this call.
        card: '0.75rem',
        control: '0.375rem'
      }
    }
  },
  plugins: []
}
