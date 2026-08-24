import type { RegisteredFile } from '../protocol.js'

export const DRAG_FILE_BRIDGE_VERSION = 2

export function acknowledgeRegisteredExport(
  event: Event,
  sessionId: string | undefined,
  add: (file: RegisteredFile) => void,
): boolean {
  const detail = (event as CustomEvent<RegisteredFile>).detail
  if (!event.cancelable || !detail || sessionId === undefined || detail.sessionId !== sessionId
    || typeof detail.id !== 'string' || typeof detail.ref !== 'string'
    || typeof detail.name !== 'string' || detail.mediaType !== 'text/markdown') return false
  add(detail)
  event.preventDefault()
  return event.defaultPrevented
}
