import { describe, expect, it } from 'vitest'
import type { CustomAction } from '@shared/types'
import { countActions, filterSortGroupActions } from './actionQuery'

function action(over: Partial<CustomAction> & { id: number; name: string }): CustomAction {
  return {
    description: null,
    protocol: 'knee',
    targetAngle: 90,
    tolerance: 10,
    holdTimeMs: 2000,
    triggerType: 'joint_angle',
    safetyLimit: null,
    ...over
  }
}

const ACTIONS: CustomAction[] = [
  action({ id: 3, name: '膝關節屈曲', targetAngle: 90, triggerType: 'joint_angle' }),
  action({ id: 1, name: '直腿抬高', targetAngle: 45, triggerType: 'segment_elevation', description: 'SLR 訓練' }),
  action({ id: 2, name: '後擺伸展', targetAngle: 20, triggerType: 'segment_extension' }),
  action({ id: 4, name: '膝關節伸直', targetAngle: 10, triggerType: 'joint_angle' })
]

const names = (groups: ReturnType<typeof filterSortGroupActions>): string[] =>
  groups.flatMap((g) => g.actions.map((a) => a.name))

describe('filterSortGroupActions — 預設', () => {
  it('無參數時依名稱排序,單一組', () => {
    const groups = filterSortGroupActions(ACTIONS)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBeNull()
    expect(countActions(groups)).toBe(4)
  })

  it('空輸入回傳一個空組,而不是空陣列', () => {
    // 呼叫端的 groups.length 才不會與「有沒有結果」混淆
    const groups = filterSortGroupActions([])
    expect(groups).toHaveLength(1)
    expect(countActions(groups)).toBe(0)
  })

  it('不就地改動傳入的陣列', () => {
    const input = [...ACTIONS]
    const before = input.map((a) => a.id)
    filterSortGroupActions(input, { sortBy: 'target' })
    expect(input.map((a) => a.id)).toEqual(before)
  })
})

describe('搜尋', () => {
  it('比對名稱,大小寫不敏感且前後空白會被 trim', () => {
    expect(names(filterSortGroupActions(ACTIONS, { query: '  膝關節  ' }))).toEqual([
      '膝關節伸直',
      '膝關節屈曲'
    ])
  })

  it('也比對說明欄位', () => {
    expect(names(filterSortGroupActions(ACTIONS, { query: 'slr' }))).toEqual(['直腿抬高'])
  })

  it('description 為 null 不會炸,也不會誤中', () => {
    expect(names(filterSortGroupActions(ACTIONS, { query: 'null' }))).toEqual([])
  })

  it('空字串等同不篩選', () => {
    expect(countActions(filterSortGroupActions(ACTIONS, { query: '' }))).toBe(4)
    expect(countActions(filterSortGroupActions(ACTIONS, { query: '   ' }))).toBe(4)
  })

  it('查無結果時回傳空組而非拋錯', () => {
    const groups = filterSortGroupActions(ACTIONS, { query: '不存在的動作' })
    expect(countActions(groups)).toBe(0)
  })
})

describe('排序', () => {
  it('target:依目標角度遞增', () => {
    expect(names(filterSortGroupActions(ACTIONS, { sortBy: 'target' }))).toEqual([
      '膝關節伸直',
      '後擺伸展',
      '直腿抬高',
      '膝關節屈曲'
    ])
  })

  it('target 相同時退回名稱排序,順序是穩定的', () => {
    // 沒有這條退路,兩個 90° 的動作每次重繪順序都可能不同,
    // 而「清單自己在跳」會被讀成資料變了
    const tied = [
      action({ id: 9, name: '乙動作', targetAngle: 90 }),
      action({ id: 8, name: '甲動作', targetAngle: 90 })
    ]
    const first = names(filterSortGroupActions(tied, { sortBy: 'target' }))
    const second = names(filterSortGroupActions([...tied].reverse(), { sortBy: 'target' }))
    expect(first).toEqual(second)
  })

  it('created:依 id 遞增(建立順序)', () => {
    expect(names(filterSortGroupActions(ACTIONS, { sortBy: 'created' }))).toEqual([
      '直腿抬高',
      '後擺伸展',
      '膝關節屈曲',
      '膝關節伸直'
    ])
  })
})

describe('分組', () => {
  it('依 triggerType 分組,組內維持排序結果', () => {
    const groups = filterSortGroupActions(ACTIONS, { groupBy: 'triggerType', sortBy: 'created' })
    expect(groups.map((g) => g.key)).toEqual([
      'segment_elevation',
      'segment_extension',
      'joint_angle'
    ])
    expect(groups[2].actions.map((a) => a.name)).toEqual(['膝關節屈曲', '膝關節伸直'])
  })

  it('組的順序由 sortBy 決定,不是雜湊順序——同一組輸入永遠同一個畫面', () => {
    const byName = filterSortGroupActions(ACTIONS, { groupBy: 'triggerType', sortBy: 'name' })
    const again = filterSortGroupActions([...ACTIONS].reverse(), {
      groupBy: 'triggerType',
      sortBy: 'name'
    })
    expect(byName.map((g) => g.key)).toEqual(again.map((g) => g.key))
  })

  it('搜尋與分組可疊加', () => {
    const groups = filterSortGroupActions(ACTIONS, { query: '膝關節', groupBy: 'triggerType' })
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('joint_angle')
    expect(countActions(groups)).toBe(2)
  })
})
