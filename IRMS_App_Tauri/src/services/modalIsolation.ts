// 共用 body 隔離租約：重疊交接時只由最後一個擁有者還原原始 inert 屬性。
const isolation = new WeakMap<Element, { original: string | null; owners: Set<symbol> }>()
let emergencyReturnTarget: HTMLElement | null = null

export function isolateBody(overlay: HTMLElement): () => void {
  const owner = Symbol('modal-isolation')
  const leased = new Set<Element>()
  const update = (): void => {
    for (const element of document.body.children) {
      if (element === overlay || element.contains(overlay) || leased.has(element)) continue
      const state = isolation.get(element) ?? { original: element.getAttribute('inert'), owners: new Set<symbol>() }
      state.owners.add(owner)
      isolation.set(element, state)
      leased.add(element)
      element.setAttribute('inert', '')
    }
  }
  update()
  const observer = new MutationObserver(update)
  observer.observe(document.body, { childList: true })
  return () => {
    observer.disconnect()
    for (const element of leased) {
      const state = isolation.get(element)
      if (!state || !state.owners.delete(owner) || state.owners.size) continue
      if (state.original == null) element.removeAttribute('inert')
      else element.setAttribute('inert', state.original)
      isolation.delete(element)
    }
  }
}

// 確認框被硬體警示搶先取消時，交出原始呼叫者，而非已被移除的取消按鈕。
export function offerEmergencyReturnTarget(target: HTMLElement | null): void {
  emergencyReturnTarget = target
}

export function takeEmergencyReturnTarget(): HTMLElement | null {
  const target = emergencyReturnTarget
  emergencyReturnTarget = null
  return target
}
