/** @type {import('tailwindcss').Config} */
// Phase 2 design tokens (craft-ui-designer skill) — dark data-console / bento-grid direction,
// confirmed with the user 2026-09-01: high-density lab/monitoring-instrument tone, no Apple
// semantics. Base neutrals and accent/semantic colors are Tailwind's own official palette
// (exact, documented hex values, not eyeballed) — slate for the cooler "console" neutral rather
// than zinc, cyan for the primary accent (reads as clinical/monitoring, common on real medical
// telemetry displays), Tailwind's emerald/amber/red for semantic status matching this app's
// existing success/warning/danger naming. Elevation uses border + background-tint steps rather
// than heavy shadows — large drop shadows barely read against a near-black canvas; that's the
// real technique dark dashboards (Linear, Vercel, GitHub dark mode) use instead.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#020617', // slate-950 — app background
        surface: '#0f172a', // slate-900 — card/panel background
        'surface-raised': '#1e293b', // slate-800 — modal/dropdown/elevated layer
        border: 'rgba(148, 163, 184, 0.16)', // slate-400 @ 16% — hairline stroke on dark bg
        'border-strong': 'rgba(148, 163, 184, 0.32)', // slate-400 @ 32% — focus/active stroke
        text: '#f1f5f9', // slate-100 — primary text
        'text-dim': '#cbd5e1', // slate-300 — secondary text
        'text-muted': '#94a3b8', // slate-400 — muted/label text
        accent: '#22d3ee', // cyan-400 — primary interactive accent
        'accent-strong': '#06b6d4', // cyan-500 — hover/pressed accent
        success: '#34d399', // emerald-400
        warning: '#fbbf24', // amber-400
        danger: '#f87171' // red-400
      },
      fontFamily: {
        // sans reuses the Inter Variable already self-hosted via @fontsource-variable/inter
        // (main.tsx) — no new font pipeline needed for UI chrome text.
        sans: ['Inter Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // mono is for numeric/data readouts (angles, reps, timers) — a data-console interface
        // should give measured values their own distinct typeface from UI chrome. JetBrains
        // Mono asset not wired up yet (Phase 4); falls back to the system monospace stack until
        // then, so this is a forward-declared token, not a broken reference.
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      boxShadow: {
        // Reserved for genuinely floating layers (dropdown/dialog) — bento cards get elevation
        // from the surface/surface-raised color step + border, not a shadow (see file header).
        floating: '0 8px 30px rgba(0, 0, 0, 0.45)'
      },
      borderRadius: {
        // Named aliases onto Tailwind's own scale so component code reads by role, not by
        // guessing which numeric step is "the card radius": card = rounded-2xl (1rem), control
        // (buttons/inputs) = rounded-lg (0.5rem), pill (badges/segmented control) = full.
        card: '1rem',
        control: '0.5rem'
      }
    }
  },
  plugins: []
}

