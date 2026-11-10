import { expect, it } from 'vitest'
import { acquireAppTransition } from './appTransition'

it('never lets an obsolete release unlock the newer transition owner', () => {
  const first = acquireAppTransition()!
  expect(acquireAppTransition()).toBeNull()
  first()
  const second = acquireAppTransition()!
  first()
  expect(acquireAppTransition()).toBeNull()
  second()
  const third = acquireAppTransition()!
  third()
})
