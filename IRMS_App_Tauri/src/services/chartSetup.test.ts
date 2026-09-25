// History's analysis chart must not depend on LiveChart having been mounted first.
import { describe, expect, it } from 'vitest'
import { Chart } from 'chart.js'
import '../views/HistoryView'

describe('chart setup', () => {
  it('HistoryView alone registers the line controller it draws with', () => {
    expect(() => Chart.registry.getController('line')).not.toThrow()
    expect(() => Chart.registry.getScale('category')).not.toThrow()
  })
})
