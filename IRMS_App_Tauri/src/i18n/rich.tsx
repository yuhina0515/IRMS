// i18n/rich.tsx
// Dictionary messages stay plain strings; the only inline markup needed by the views is bold
// emphasis, written as **text**. Each language can place the emphasis where its grammar puts it,
// which is not possible if the view splits a sentence around <b> elements.
import { Fragment, type ReactNode } from 'react'

/** Render `**bold**` segments as <b>; everything else stays text. */
export function rich(message: string): ReactNode {
  const parts = message.split('**')
  return parts.map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>))
}
