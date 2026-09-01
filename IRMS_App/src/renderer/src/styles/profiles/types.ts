// renderer/styles/profiles/types.ts
// A style profile is a complete, self-contained set of CSS custom-property values —
// not a diff against another profile — so a new style can be added as one file without
// needing to know what any other profile does or doesn't override.

export interface StyleProfile {
  id: string
  name: string
  description: string
  /** CSS custom-property name (incl. leading `--`) -> value, applied to :root */
  tokens: Record<string, string>
}
