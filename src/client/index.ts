/**
 * DragView — browser half of dsh-dragview.
 *
 * Drag a local file anywhere over the page:
 *   - image/* files → never intercepted; DSH handles them natively
 *     (thumbnail rail + message images).
 *   - everything else → per config:
 *       mode 'resolve'  ask the host locator to search workspace → system
 *                       dirs → index → bounded walk, then prove file content
 *                       before receiving a registered attachment;
 *       mode 'copy'     upload the bytes to the host, which writes them into
 *                       <workspace>/<dropDir>/ and returns the copy path.
 *   The resolved path becomes a Codex-style pill in the composer rail. The
 *   pill shows icon + name + size only — never the path.
 *
 * On send, the conversation.sendSession prototype is patched: when pills are
 * queued, the message content gets one text part whose lines are `@"<path>"`
 * file-reference mentions (the platform renders those as refChip pills in the
 * message history), prefixed to the user's own text. Native image drafts stay
 * untouched. The queue clears only after a successful send.
 *
 * Drag interception adapted from omdsh-dev/dsh-drag-and-drop (BSD-3-Clause);
 * pill rail + sendSession patch pattern adapted from loudMore/dsh-drop-to-path
 * (MIT), with `@"path"` mention syntax instead of raw paths so the history
 * renders Codex-style file pills instead of plain text paths.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import {
  CONFIG_ROUTE,
  COPY_ROUTE,
  REVOKE_ROUTE,
  type DragFileConfig,
  type RegisteredFile,
} from '../protocol.js'
import { choosePath } from './chooser.js'
import { chooseLocatedFile, locateDroppedFile } from './locator.js'
import {
  addPill,
  clearPills,
  fileQueue,
  injectRailStyle,
  mountPillRail,
  pillsList,
  refreshPills,
  setActiveSessionProvider,
  setPillChangeListener,
  setPillDisposeListener,
} from './pills.js'
import { closeActivePreview, notifyUser } from './preview.js'
import { DragFileSettingsSection } from './settings-section.js'
import { acknowledgeRegisteredExport, DRAG_FILE_BRIDGE_VERSION } from './export-bridge.js'

export const inject = ['conversation', 'sessions', 'workspaces', 'slots']

const PATCH_MARK = '__dshDragFilePatched'
const OVERLAY_ID = 'dsh-drag-file-overlay'
/** Invisible non-whitespace sentinel that keeps the composer's send button
 *  enabled when only attachments are queued (the platform enables sending
 *  when `draft.trim() !== ''`); stripped from the text in the send patch. */
const SENTINEL = '\u2060'

let config: DragFileConfig = { mode: 'resolve', dropDir: '.drops' }

async function loadConfig(): Promise<void> {
  try {
    const response = await fetch(CONFIG_ROUTE)
    const result = await response.json() as { ok?: boolean; value?: Partial<DragFileConfig> }
    if (response.ok && result.ok && result.value) {
      config = { ...config, ...result.value }
    }
  } catch (error) {
    console.error('[dsh-drag-file] config load failed:', error)
  }
}

function isImageFile(file: File): boolean {
  return !!file && typeof file.type === 'string' && file.type.indexOf('image/') === 0
}

function currentSessionId(sessions: unknown): string | undefined {
  try {
    const id = (sessions as { list?: { getSnapshot?: () => { current?: string } } })?.list?.getSnapshot?.().current
    return typeof id === 'string' && id.length > 0 ? id : undefined
  } catch { return undefined }
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Upload one file to the host and resolve its workspace drop-copy path. */
async function copyFileToWorkspace(file: File, sessionId: string): Promise<RegisteredFile> {
  const buffer = await file.arrayBuffer()
  const payload: Record<string, unknown> = { name: file.name, dataBase64: toBase64(buffer), sessionId }
  const response = await fetch(COPY_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json() as { ok?: boolean; error?: { message?: string }; value?: RegisteredFile }
  if (!response.ok || !result.ok) {
    throw new Error(result.error && result.error.message ? result.error.message : 'copy failed')
  }
  if (!result.value || typeof result.value.id !== 'string' || typeof result.value.ref !== 'string') throw new Error('copy returned no registered file')
  return result.value
}

/**
 * Resolve one non-image dropped file through the host-owned locator. The
 * browser sends metadata and content proofs only, then shows the chooser if
 * host-held candidates remain ambiguous after metadata → sample → full.
 */
async function resolveFile(
  file: File,
  sessionId: string,
): Promise<RegisteredFile | undefined> {
  let result = await locateDroppedFile(file, sessionId)
  if (result.status === 'found') return result.file
  if (result.status === 'choose') {
    const choiceId = await choosePath(file.name, result.choices)
    if (choiceId === undefined) return undefined
    result = await chooseLocatedFile(result.resolutionId, choiceId)
    if (result.status === 'found') return result.file
  }
  if (result.status === 'error') throw new Error(result.message)
  return undefined
}

interface DropOverlay {
  setActive(active: boolean): void
  dispose(): void
}

function createOverlay(): DropOverlay {
  const root = document.createElement('div')
  root.id = OVERLAY_ID
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  Object.assign(root.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', display: 'grid', placeItems: 'center',
    padding: '24px', pointerEvents: 'none', opacity: '0', visibility: 'hidden',
    transition: 'opacity 140ms ease, visibility 140ms ease', background: 'rgb(15 23 42 / 44%)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  })
  const panel = document.createElement('div')
  Object.assign(panel.style, {
    display: 'grid', justifyItems: 'center', gap: '14px', minWidth: '260px', padding: '28px 36px',
    color: '#ffffff',
    font: '600 16px/1.4 -apple-system, BlinkMacSystemFont, sans-serif',
    letterSpacing: '0',
  })
  const label = document.createElement('span')
  panel.append(label)
  root.append(panel)
  document.body.append(root)
  return {
    setActive(active) {
      label.textContent = config.mode === 'copy'
        ? '松开鼠标以复制文件到工作区'
        : '松开鼠标以引用文件路径'
      root.style.opacity = active ? '1' : '0'
      root.style.visibility = active ? 'visible' : 'hidden'
    },
    dispose() { root.remove() },
  }
}

function hasFilePayload(event: DragEvent): boolean {
  const types = event.dataTransfer?.types ?? []
  return types.includes('Files') || types.includes('text/uri-list')
}

/** The current session's composer input controller, when reachable. */
function currentInput(ctx: ClientContext): { state: { getSnapshot: () => { draft: string } }; setDraft: (text: string) => void } | undefined {
  try {
    const sessionId = ctx.sessions.list.getSnapshot().current
    if (sessionId === undefined) return undefined
    const scope = ctx.sessions.scope(sessionId)
    const conversation = ctx.get('conversation')
    const input = scope !== undefined && conversation !== undefined
      ? conversation.input.for(scope)
      : undefined
    return input as { state: { getSnapshot: () => { draft: string } }; setDraft: (text: string) => void } | undefined
  } catch { return undefined }
}

/** Keep the composer sendable with attachments-only drafts (sentinel), and
 *  clear the sentinel again when the last pill is removed. */
function syncDraftSentinel(ctx: ClientContext): void {
  try {
    const input = currentInput(ctx)
    if (!input) return
    const draft = input.state.getSnapshot().draft
    const sessionId = currentSessionId(ctx.sessions)
    if (sessionId !== undefined && pillsList(sessionId).length > 0) {
      if (draft.trim() === '') input.setDraft(SENTINEL)
    } else if (draft === SENTINEL) {
      input.setDraft('')
    }
  } catch { /* best-effort */ }
}

/** Wrap conversation.sendSession on the prototype: pills → `@"path"` mentions. */
function patchSendSession(ctx: ClientContext, conversation: unknown): void {
  const proto = (conversation as { constructor?: { prototype?: Record<string, unknown> } })?.constructor?.prototype
  if (!proto || typeof proto.sendSession !== 'function' || proto[PATCH_MARK]) return
  proto[PATCH_MARK] = true

  const original = proto.sendSession as (...args: unknown[]) => Promise<unknown>
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  proto.sendSession = async function (this: unknown, session: unknown, text: string, imageIds: string[] | undefined, mode: unknown, signal: unknown) {
    const sessionId = currentSessionId(ctx.sessions)
    const queued = sessionId === undefined ? [] : pillsList(sessionId)
    const filePaths = queued.map((item) => item.ref)
    if (filePaths.length === 0) return original.call(this, session, text, imageIds, mode, signal)

    const controller = this as {
      draftImages?: (ids: string[] | undefined) => Array<{ file: File }>
      serializeImages?: (files: readonly File[]) => Promise<readonly unknown[]>
      releaseDraftImages?: (attachments: Array<{ file: File }>) => void
    }
    const attachments = typeof controller.draftImages === 'function' ? controller.draftImages(imageIds) : []
    if (attachments.length !== (imageIds ?? []).length) {
      throw new Error('conversation.sendSession: one or more draft images are no longer available')
    }
    // `@"<path>"` mention lines render as refChip file pills in the history
    // and stay machine-readable for the (text-only) model. The invisible
    // send-enable sentinel (attachments-only drafts) is stripped here.
    const cleanText = (text ?? '').replace(/\u2060/g, '')
    const refs = filePaths.map((path) => `@"${path}"`).join('\n')
    const fullText = cleanText.trim() === '' ? refs : `${refs}\n${cleanText}`
    const content = [
      ...(typeof controller.serializeImages === 'function'
        ? await controller.serializeImages(attachments.map((attachment) => attachment.file))
        : []),
      { type: 'text', text: fullText },
    ]
    const result = await (session as { prompt?: (content: unknown, mode: unknown, signal?: unknown) => Promise<{ ok: boolean }> })
      .prompt?.(content, mode, signal)
    if (!result?.ok) return { kind: 'error' }
    if (typeof controller.releaseDraftImages === 'function') controller.releaseDraftImages(attachments)
    clearPills(sessionId) // only on success — a failed send keeps the pills
    return { kind: 'success' }
  }
}

export function apply(ctx: ClientContext): void {
  void loadConfig()
  let dragDepth = 0
  const overlay = createOverlay()

  const onDragEnter = (event: DragEvent): void => {
    if (!hasFilePayload(event)) return
    dragDepth += 1
    overlay.setActive(true)
  }
  const onDragOver = (event: DragEvent): void => {
    if (!hasFilePayload(event)) return
    event.preventDefault()
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy'
    overlay.setActive(true)
  }
  const onDragLeave = (event: DragEvent): void => {
    if (!hasFilePayload(event)) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) overlay.setActive(false)
  }
  const onDrop = (event: DragEvent): void => {
    if (!hasFilePayload(event)) return
    const files = Array.prototype.slice.call(event.dataTransfer ? event.dataTransfer.files : []) as File[]
    const images = files.filter(isImageFile)
    const others = files.filter((file) => !isImageFile(file))
    // Pure-image drop: let DSH handle it natively (rail, overlay close,
    // everything) — but still close our own drop overlay and reset drag
    // state so the "release to drop" surface never sticks after mouse-up.
    if (others.length === 0) {
      dragDepth = 0
      overlay.setActive(false)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    dragDepth = 0
    overlay.setActive(false)

    const sessionId = currentSessionId(ctx.sessions)
    if (sessionId === undefined) {
      notifyUser('当前会话没有可用的工作区，无法添加文件。')
      return
    }
    const target = event.target as EventTarget | null

    // Mixed drop: re-dispatch the images as a pure-image drop (the rule above
    // lets it through, so DSH builds its native rail and closes its overlay).
    if (images.length > 0) {
      try {
        const dt = new DataTransfer()
        images.forEach((file) => dt.items.add(file))
        setTimeout(() => {
          try {
            target?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
          } catch (error) {
            console.error('[dsh-drag-file] image re-dispatch failed:', error)
          }
        }, 0)
      } catch (error) {
        console.error('[dsh-drag-file] image re-dispatch setup failed:', error)
      }
    }

    // DSH closes its full-screen drop overlay on `dragend` (window listener,
    // unconditional). Dispatch one so the overlay never stays stuck.
    setTimeout(() => {
      try { window.dispatchEvent(new DragEvent('dragend')) } catch { /* best-effort */ }
    }, 0)

    for (const file of others) {
      const work = config.mode === 'copy'
        ? copyFileToWorkspace(file, sessionId)
        : resolveFile(file, sessionId)
      work.then((registered) => {
        if (registered === undefined) {
          notifyUser(`没有找到“${file.name}”的原始文件。`)
          return
        }
        addPill({ ...registered, sessionId })
      }).catch((error) => {
        notifyUser(error instanceof Error ? error.message : '文件处理失败')
      })
    }
  }

  // The drop listener runs in CAPTURE phase and stops propagation for
  // non-image drops, so no other in-page handler (platform or other plugins)
  // ever sees them — no stray "file saved" toasts or duplicate handling.
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop, true)

  const conversation = ctx.get('conversation')
  if (conversation) patchSendSession(ctx, conversation)
  setActiveSessionProvider(() => currentSessionId(ctx.sessions))
  const disposeRail = mountPillRail()
  const disposeStyle = injectRailStyle()
  setPillChangeListener(() => syncDraftSentinel(ctx))
  const revokeTokens = (items: readonly { readonly id: string; readonly sessionId: string }[], keepalive = false): void => {
    if (items.length === 0) return
    const groups = new Map<string, string[]>()
    for (const item of items) groups.set(item.sessionId, [...(groups.get(item.sessionId) ?? []), item.id])
    for (const [sessionId, ids] of groups) {
    const body = JSON.stringify({ sessionId, ids })
    if (keepalive && typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon(REVOKE_ROUTE, new Blob([body], { type: 'application/json' }))
      if (sent) continue
    }
    void fetch(REVOKE_ROUTE, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive,
    }).catch(() => undefined)
    }
  }
  setPillDisposeListener((items) => revokeTokens(items))
  const onPageHide = (): void => revokeTokens(fileQueue, true)
  window.addEventListener('pagehide', onPageHide)

  const sessionList = ctx.sessions.list as unknown as { subscribe?: (listener: () => void) => (() => void) }
  const disposeSessionListener = sessionList.subscribe?.(() => { refreshPills(); syncDraftSentinel(ctx) }) ?? (() => {})

  // Bridge for other host-integrated plugins (e.g. side-chat). It only accepts
  // an attachment already registered by dshDragFileHost. Browser paths/content
  // can never mint file access authority.
  const onAddPillEvent = (event: Event): void => {
    const sessionId = currentSessionId(ctx.sessions)
    acknowledgeRegisteredExport(event, sessionId, addPill)
  }
  window.addEventListener('dsh-drag-file:add-pill', onAddPillEvent)
  ;(window as unknown as { __dshDragFileBridgeVersion?: number }).__dshDragFileBridgeVersion = DRAG_FILE_BRIDGE_VERSION

  // Native settings section in the DSH Settings shell (third-party pattern,
  // same as dsh-better-sidebar: component passed directly, label as a
  // function). Guarded: a settings-section failure must never take the rest
  // of the plugin (drag, pills, send) down with it.
  let removeSettingsSection = () => {}
  try {
    removeSettingsSection = ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: 'drag-file',
      order: 100,
      label: () => 'DragView 文件附件设置',
    }, DragFileSettingsSection))
  } catch (error) {
    console.warn('[dsh-drag-file] settings section registration failed:', error)
  }

  ctx.effect(() => () => {
    window.removeEventListener('dragenter', onDragEnter)
    window.removeEventListener('dragover', onDragOver)
    window.removeEventListener('dragleave', onDragLeave)
    window.removeEventListener('drop', onDrop, true)
    window.removeEventListener('pagehide', onPageHide)
    overlay.dispose()
    revokeTokens(fileQueue, true)
    setPillDisposeListener(null)
    clearPills()
    disposeRail()
    disposeStyle()
    setPillChangeListener(null)
    setActiveSessionProvider(null)
    disposeSessionListener()
    window.removeEventListener('dsh-drag-file:add-pill', onAddPillEvent)
    closeActivePreview()
    document.querySelector('[data-drag-file-notice]')?.remove()
    delete (window as unknown as { __dshDragFileBridgeVersion?: number }).__dshDragFileBridgeVersion
    removeSettingsSection()
  }, 'drag-file: client lifecycle')
}
