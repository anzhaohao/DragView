import { OPEN_ROUTE, PREVIEW_ROUTE, TEXT_PREVIEW_ROUTE } from '../protocol.js'
import type { Pill } from './pills.js'

interface JsonResult {
  readonly ok?: boolean
  readonly value?: { readonly text?: string; readonly truncated?: boolean }
  readonly error?: { readonly message?: string }
}

let activeClose: (() => void) | undefined

export function closeActivePreview(): void { activeClose?.() }

async function jsonOrError(response: Response): Promise<JsonResult> {
  try { return await response.json() as JsonResult } catch { return {} }
}

export function notifyUser(message: string): void {
  document.querySelector('[data-drag-file-notice]')?.remove()
  const notice = document.createElement('div')
  notice.setAttribute('data-drag-file-notice', '1')
  notice.setAttribute('role', 'alert')
  notice.textContent = message
  document.body.append(notice)
  window.setTimeout(() => notice.remove(), 5000)
}

export async function openInSystem(item: Pill): Promise<void> {
  const response = await fetch(OPEN_ROUTE, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: item.id, sessionId: item.sessionId }),
  })
  const result = await jsonOrError(response)
  if (!response.ok || !result.ok) throw new Error(result.error?.message || '无法使用系统默认应用打开文件')
}

function actionButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.textContent = label
  return button
}

export function activateAttachment(item: Pill, trigger: HTMLElement): void {
  if (item.previewKind === 'system') {
    void openInSystem(item).catch((error) => notifyUser(error instanceof Error ? error.message : '无法打开文件'))
    return
  }
  closeActivePreview()
  const controller = new AbortController()
  const backdrop = document.createElement('div')
  backdrop.setAttribute('data-drag-file-preview', '1')
  backdrop.className = 'dsh-drag-file-preview-backdrop'
  backdrop.setAttribute('role', 'dialog')
  backdrop.setAttribute('aria-modal', 'true')
  backdrop.setAttribute('aria-label', `预览 ${item.name}`)

  const panel = document.createElement('section')
  panel.className = 'dsh-drag-file-preview-panel'
  const header = document.createElement('header')
  header.className = 'dsh-drag-file-preview-header'
  const heading = document.createElement('div')
  heading.className = 'dsh-drag-file-preview-heading'
  const title = document.createElement('strong')
  title.textContent = item.name
  const meta = document.createElement('span')
  meta.textContent = `${item.typeLabel} · ${item.formattedSize}`
  heading.append(title, meta)
  const close = actionButton('×', 'dsh-drag-file-preview-close')
  close.setAttribute('aria-label', '关闭预览')
  header.append(heading, close)

  const content = document.createElement('div')
  content.className = 'dsh-drag-file-preview-content'
  content.setAttribute('aria-live', 'polite')
  content.textContent = '正在加载预览…'
  const footer = document.createElement('footer')
  footer.className = 'dsh-drag-file-preview-footer'
  const open = actionButton('用系统默认应用打开', 'dsh-drag-file-preview-open')
  footer.append(open)
  panel.append(header, content, footer)
  backdrop.append(panel)
  let previewTimer: ReturnType<typeof window.setTimeout> | undefined

  const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') finish() }
  const finish = (): void => {
    controller.abort()
    if (previewTimer !== undefined) window.clearTimeout(previewTimer)
    backdrop.querySelector('iframe')?.removeAttribute('src')
    document.removeEventListener('keydown', onKey)
    backdrop.remove()
    if (activeClose === finish) activeClose = undefined
    if (trigger.isConnected) trigger.focus()
  }
  const fail = (message: string): void => {
    if (previewTimer !== undefined) window.clearTimeout(previewTimer)
    content.replaceChildren()
    const error = document.createElement('div')
    error.className = 'dsh-drag-file-preview-error'
    error.textContent = message
    content.append(error)
  }
  close.addEventListener('click', finish)
  const preventBackdropFocus = (event: Event): void => {
    if (event.target === backdrop) event.preventDefault()
  }
  backdrop.addEventListener('pointerdown', preventBackdropFocus)
  backdrop.addEventListener('mousedown', preventBackdropFocus)
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) finish() })
  open.addEventListener('click', () => {
    void openInSystem(item).catch((error) => fail(error instanceof Error ? error.message : '无法打开文件'))
  })
  document.addEventListener('keydown', onKey)
  activeClose = finish
  document.body.append(backdrop)
  close.focus()

  void (async () => {
    try {
      if (item.previewKind === 'text') {
        const response = await fetch(`${TEXT_PREVIEW_ROUTE}?id=${encodeURIComponent(item.id)}&sessionId=${encodeURIComponent(item.sessionId)}`, { signal: controller.signal })
        const text = await response.text()
        if (!response.ok) {
          let message = '文本预览加载失败'
          try { message = (JSON.parse(text) as JsonResult).error?.message || message } catch {}
          throw new Error(message)
        }
        const pre = document.createElement('pre')
        pre.className = 'dsh-drag-file-preview-text'
        pre.textContent = text
        content.replaceChildren(pre)
        if (response.headers.get('x-dsh-drag-file-truncated') === '1') {
          const warning = document.createElement('div')
          warning.className = 'dsh-drag-file-preview-truncated'
          warning.textContent = '文件较长，仅显示前 1 MB 内容。'
          content.append(warning)
        }
        return
      }
      const src = `${PREVIEW_ROUTE}?id=${encodeURIComponent(item.id)}&sessionId=${encodeURIComponent(item.sessionId)}`
      const probe = await fetch(src, { method: 'HEAD', signal: controller.signal })
      if (!probe.ok) {
        const result = await jsonOrError(probe)
        throw new Error(result.error?.message || '预览加载失败')
      }
      if (item.previewKind === 'pdf') {
        const iframe = document.createElement('iframe')
        iframe.className = 'dsh-drag-file-preview-pdf'
        iframe.title = item.name
        iframe.addEventListener('load', () => {
          if (previewTimer !== undefined) window.clearTimeout(previewTimer)
          previewTimer = undefined
        }, { once: true })
        iframe.addEventListener('error', () => fail('PDF 预览失败。你仍可使用系统默认应用打开。'), { once: true })
        previewTimer = window.setTimeout(() => fail('PDF 预览加载超时。你仍可使用系统默认应用打开。'), 12_000)
        iframe.src = src
        content.replaceChildren(iframe)
      } else if (item.previewKind === 'video') {
        const video = document.createElement('video')
        video.className = 'dsh-drag-file-preview-video'
        video.controls = true
        video.preload = 'metadata'
        video.src = src
        video.addEventListener('error', () => fail('视频预览失败。你仍可使用系统默认应用打开。'), { once: true })
        content.replaceChildren(video)
      } else {
        const audio = document.createElement('audio')
        audio.className = 'dsh-drag-file-preview-audio'
        audio.controls = true
        audio.preload = 'metadata'
        audio.src = src
        audio.addEventListener('error', () => fail('音频预览失败。你仍可使用系统默认应用打开。'), { once: true })
        content.replaceChildren(audio)
      }
    } catch (error) {
      if (!controller.signal.aborted) fail(error instanceof Error ? error.message : '预览加载失败')
    }
  })()
}
