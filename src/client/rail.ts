export const PILLS_ATTR = 'data-drag-file-pills'
export const NATIVE_WRAPPER_ATTR = 'data-drag-file-native-wrapper'
export const NATIVE_INNER_ATTR = 'data-drag-file-native-inner'

export interface NativeAttachmentRail {
  readonly wrapper: HTMLElement
  readonly inner: HTMLElement
}

const coordinatedRails = new WeakMap<HTMLElement, NativeAttachmentRail>()

function pluginOwned(element: Element): boolean {
  return element.hasAttribute(PILLS_ATTR) || element.classList.contains('dsh-side-chat-parent-annotation-rail')
}

export function findNativeAttachmentRail(slot: HTMLElement): NativeAttachmentRail | undefined {
  for (const child of slot.children) {
    if (pluginOwned(child) || !(child instanceof HTMLElement)) continue
    const direct = Array.from(child.children).find((item) => item.getAttribute('role') === 'group')
    const inner = direct instanceof HTMLElement ? direct : child.querySelector<HTMLElement>('[role="group"]')
    if (inner !== null) return { wrapper: child, inner }
  }
  return undefined
}

/** Coordinate the native attachment rail even when no file-card bar exists. */
export function placePillBar(slot: HTMLElement, bar?: HTMLElement): NativeAttachmentRail | undefined {
  const previous = coordinatedRails.get(slot)
  previous?.wrapper.removeAttribute(NATIVE_WRAPPER_ATTR)
  previous?.inner.removeAttribute(NATIVE_INNER_ATTR)
  slot.querySelectorAll(`[${NATIVE_WRAPPER_ATTR}], [${NATIVE_INNER_ATTR}]`).forEach((element) => {
    element.removeAttribute(NATIVE_WRAPPER_ATTR)
    element.removeAttribute(NATIVE_INNER_ATTR)
  })
  const native = findNativeAttachmentRail(slot)
  if (native !== undefined) {
    native.wrapper.setAttribute(NATIVE_WRAPPER_ATTR, '1')
    native.inner.setAttribute(NATIVE_INNER_ATTR, '1')
    coordinatedRails.set(slot, native)
    if (bar !== undefined && bar.parentElement !== native.inner) native.inner.appendChild(bar)
    return native
  }
  coordinatedRails.delete(slot)
  if (bar === undefined) return undefined
  const reference = Array.from(slot.children)
    .find((child) => child.classList.contains('dsh-side-chat-parent-annotation-rail')) ?? null
  if (bar.parentElement !== slot || bar.nextElementSibling !== reference) slot.insertBefore(bar, reference)
  return undefined
}

/** Start the debounced child-list observer used by the live composer. */
export function startAttachmentRailObserver(target: Node, reconcile: () => void, delayMs = 60): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const observer = new MutationObserver(() => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      reconcile()
    }, delayMs)
  })
  observer.observe(target, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    if (timer !== undefined) clearTimeout(timer)
  }
}

export function wireAttachmentCardActions(
  main: HTMLButtonElement,
  remove: HTMLButtonElement,
  onActivate: () => void,
  onRemove: () => void,
): void {
  main.addEventListener('click', onActivate)
  const stopPropagation = (event: Event): void => { event.stopPropagation() }
  for (const type of ['pointerdown', 'mousedown', 'keydown'] as const) remove.addEventListener(type, stopPropagation)
  remove.addEventListener('click', (event) => { stopPropagation(event); onRemove() })
}
