import type { PreviewKind } from '../protocol.js'
import { FILE_ICONS } from './icons.js'
import { activateAttachment } from './preview.js'
import {
  NATIVE_INNER_ATTR,
  NATIVE_WRAPPER_ATTR,
  PILLS_ATTR,
  placePillBar,
  startAttachmentRailObserver,
  wireAttachmentCardActions,
} from './rail.js'

export interface Pill {
  readonly id: string
  readonly ref: string
  readonly name: string
  readonly size: number
  readonly mediaType: string
  readonly typeLabel: string
  readonly previewKind: PreviewKind
  readonly sessionId: string
  readonly formattedSize: string
}

export const fileQueue: Pill[] = []
/** Sent-reference registry keyed by canonical path: keeps the fileId + metadata
 *  alive after a successful send so the message-body `@"path"` refChip can be
 *  upgraded to the same Codex-style card and still preview/open via its token. */
const sentRefs = new Map<string, Pill>()
let onChange: (() => void) | null = null
let onDispose: ((items: readonly Pill[]) => void) | null = null
let activeSession: (() => string | undefined) | null = null

export function setPillChangeListener(listener: (() => void) | null): void { onChange = listener }
export function setPillDisposeListener(listener: ((items: readonly Pill[]) => void) | null): void { onDispose = listener }
export function setActiveSessionProvider(provider: (() => string | undefined) | null): void { activeSession = provider }

function currentPills(): Pill[] {
  const id = activeSession?.()
  return id === undefined ? [] : fileQueue.filter((item) => item.sessionId === id)
}

function changed(): void {
  renderPills()
  onChange?.()
  if (currentPills().length > 0) document.body.setAttribute('data-dsh-drag-file-pills', '1')
  else document.body.removeAttribute('data-dsh-drag-file-pills')
}

export function addPill(pill: Omit<Pill, 'formattedSize'>): void {
  if (fileQueue.some((item) => item.id === pill.id)) return
  fileQueue.push({ ...pill, formattedSize: formatSize(pill.size) })
  changed()
}

export function removePill(id: string): void {
  const index = fileQueue.findIndex((item) => item.id === id)
  if (index < 0) return
  const [removed] = fileQueue.splice(index, 1)
  onDispose?.([removed])
  changed()
}

export function clearPills(sessionId?: string): void {
  // Clears the composer queue only — it does NOT dispose/revoke tokens. After a
  // successful send the tokens must stay live so the message-body refChips can
  // still preview/open. Callers that need revocation (removePill / lifecycle
  // teardown) do it explicitly.
  if (sessionId === undefined) {
    fileQueue.splice(0)
  } else {
    for (let index = fileQueue.length - 1; index >= 0; index -= 1) {
      if (fileQueue[index].sessionId === sessionId) fileQueue.splice(index, 1)
    }
  }
  changed()
}

/** Keep sent attachments (path → pill) so post-send refChips stay card-like and
 *  clickable. Memory-only: after a page reload the history chips degrade to the
 *  platform's plain refChip. */
export function rememberSentPills(pills: readonly Pill[]): void {
  for (const pill of pills) sentRefs.set(pill.ref, pill)
}

export function sentPillForPath(path: string): Pill | undefined {
  return sentRefs.get(path)
}

export function sentRefsList(): readonly Pill[] {
  return [...sentRefs.values()]
}

export function pillsList(sessionId?: string): readonly Pill[] {
  return sessionId === undefined ? fileQueue : fileQueue.filter((item) => item.sessionId === sessionId)
}

export function fileKind(name: string): { icon?: string; ext?: string; className: string } {
  const ext = (String(name || '').toLowerCase().split('.').at(-1) ?? '').trim()
  if (ext === 'pdf') return { icon: FILE_ICONS.pdf, className: 'pdf' }
  if (/^docx?$/.test(ext)) return { icon: FILE_ICONS.doc, className: 'word' }
  if (/^xlsx?$/.test(ext)) return { icon: FILE_ICONS.xls, className: 'excel' }
  if (/^pptx?$/.test(ext)) return { icon: FILE_ICONS.ppt, className: 'powerpoint' }
  if (/^(zip|rar|7z|tar|gz)$/.test(ext)) return { icon: FILE_ICONS.zip, className: 'archive' }
  if (/^(mp4|mov|m4v|webm|mkv|avi)$/.test(ext)) return { icon: FILE_ICONS.vid, className: 'video' }
  if (/^(mp3|wav|flac|m4a|ogg)$/.test(ext)) return { icon: FILE_ICONS.aud, className: 'audio' }
  if (/^(py|js|ts|tsx|jsx|go|rs|java|c|cpp|h|sh|ps1|sql)$/.test(ext)) return { icon: FILE_ICONS.code, className: 'code' }
  if (/^(txt|md|markdown|csv|json|ndjson|log|yaml|yml|toml|xml|html|css)$/.test(ext)) return { icon: FILE_ICONS.text, className: 'text' }
  if (ext.length > 0) return { ext: ext.toUpperCase().slice(0, 4), className: 'generic' }
  return { icon: FILE_ICONS.file, className: 'generic' }
}

export function fileIconElement(name: string): HTMLElement {
  const kind = fileKind(name)
  const tile = document.createElement('span')
  tile.className = `dsh-drag-file-icon dsh-drag-file-icon-${kind.className}`
  if (kind.icon) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('aria-hidden', 'true')
    svg.innerHTML = kind.icon
    tile.append(svg)
  } else {
    tile.textContent = kind.ext ?? ''
  }
  return tile
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '大小未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function findComposer(): HTMLTextAreaElement | null { return document.querySelector('textarea') }
function findAttachmentSlot(): HTMLElement | null { return document.querySelector('[data-slot="conversation.input.attachments"]') }

function findCard(ta: HTMLTextAreaElement): HTMLElement | null {
  const scroll = ta.parentElement?.parentElement
  return scroll?.parentElement ?? null
}

function renderPills(): void {
  document.querySelectorAll(`[${PILLS_ATTR}]`).forEach((node) => node.remove())
  const items = currentPills()
  const ta = findComposer()
  const slot = findAttachmentSlot()
  if (items.length === 0) {
    if (slot !== null) placePillBar(slot)
    return
  }
  if (!ta) return
  const bar = document.createElement('div')
  bar.setAttribute(PILLS_ATTR, '1')
  bar.setAttribute('aria-label', '文件附件')

  for (const item of items) {
    const card = document.createElement('div')
    card.className = 'dsh-drag-file-card'
    card.setAttribute('data-preview-kind', item.previewKind)
    const main = document.createElement('button')
    main.type = 'button'
    main.className = 'dsh-drag-file-main'
    main.setAttribute('aria-label', `${item.name}，${item.typeLabel}，${item.formattedSize}`)

    const tile = fileIconElement(item.name)
    const copy = document.createElement('span')
    copy.className = 'dsh-drag-file-copy'
    const name = document.createElement('span')
    name.className = 'dsh-drag-file-name'
    name.textContent = item.name
    name.title = item.name
    const meta = document.createElement('span')
    meta.className = 'dsh-drag-file-meta'
    meta.textContent = `${item.typeLabel} · ${item.formattedSize}`
    copy.append(name, meta)

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'dsh-drag-file-remove'
    remove.textContent = '×'
    remove.title = '移除附件'
    remove.setAttribute('aria-label', `移除 ${item.name}`)
    wireAttachmentCardActions(main, remove, () => activateAttachment(item, main), () => removePill(item.id))

    main.append(tile, copy)
    card.append(main, remove)
    bar.append(card)
  }

  if (slot) {
    placePillBar(slot, bar)
    return
  }
  const composerCard = findCard(ta)
  const scroll = ta.parentElement?.parentElement
  if (composerCard && scroll) composerCard.insertBefore(bar, scroll)
}

function reconcilePillBar(): void {
  const slot = findAttachmentSlot()
  if (currentPills().length === 0) {
    if (slot !== null) placePillBar(slot)
    return
  }
  const bar = document.querySelector<HTMLElement>(`[${PILLS_ATTR}]`)
  if (bar === null) { renderPills(); return }
  if (slot !== null) placePillBar(slot, bar)
}

function ensurePillsObserver(ta: HTMLTextAreaElement | null): () => void {
  const target = (ta === null ? null : findCard(ta)) ?? findAttachmentSlot()
  if (!target) return () => {}
  return startAttachmentRailObserver(target, reconcilePillBar)
}

export function injectRailStyle(): () => void {
  document.getElementById('dsh-drag-file-style')?.remove()
  const style = document.createElement('style')
  style.id = 'dsh-drag-file-style'
  style.textContent = `
:root{--dsh-drag-bg:#ffffff;--dsh-drag-bg-subtle:#f4f5f7;--dsh-drag-border:rgba(71,85,105,.38);--dsh-drag-text:#172033;--dsh-drag-muted:#56647a;--dsh-drag-danger:#b42318;--dsh-drag-warning-bg:#fff4d6;--dsh-drag-warning-text:#775400}
@media(prefers-color-scheme:dark){:root{--dsh-drag-bg:#202226;--dsh-drag-bg-subtle:#17191c;--dsh-drag-border:rgba(226,232,240,.24);--dsh-drag-text:#f1f3f5;--dsh-drag-muted:#b0b5bd;--dsh-drag-danger:#ff8b82;--dsh-drag-warning-bg:#493b16;--dsh-drag-warning-text:#f5d77b}}
:root[color-scheme="light"],:root[data-theme="light"],:root[data-color-scheme="light"],html.light,body[data-theme="light"],body.light,[style*="color-scheme: light"]{--dsh-drag-bg:#ffffff;--dsh-drag-bg-subtle:#f4f5f7;--dsh-drag-border:rgba(71,85,105,.38);--dsh-drag-text:#172033;--dsh-drag-muted:#56647a;--dsh-drag-danger:#b42318;--dsh-drag-warning-bg:#fff4d6;--dsh-drag-warning-text:#775400}
:root[color-scheme="dark"],:root[data-theme="dark"],:root[data-color-scheme="dark"],html.dark,body[data-theme="dark"],body.dark,[style*="color-scheme: dark"]{--dsh-drag-bg:#202226;--dsh-drag-bg-subtle:#17191c;--dsh-drag-border:rgba(226,232,240,.24);--dsh-drag-text:#f1f3f5;--dsh-drag-muted:#b0b5bd;--dsh-drag-danger:#ff8b82;--dsh-drag-warning-bg:#493b16;--dsh-drag-warning-text:#f5d77b}
[data-slot="conversation.input.attachments"]{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:8px!important;min-width:0}
[${NATIVE_WRAPPER_ATTR}]{position:static!important;inset:auto!important;display:block!important;min-width:0!important;width:auto!important;height:auto!important;overflow:visible!important}
[${NATIVE_INNER_ATTR}]{display:flex!important;flex-flow:row wrap!important;align-items:center!important;gap:8px!important;min-width:0!important;width:100%!important;height:auto!important;max-height:none!important;overflow:visible!important}
[${PILLS_ATTR}]{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
[${NATIVE_INNER_ATTR}]>[${PILLS_ATTR}]{display:contents!important}
[data-slot="conversation.input.attachments"]>[${PILLS_ATTR}]{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;padding:0 12px}
.dsh-drag-file-card{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 24px;align-items:center;column-gap:4px;box-sizing:border-box;width:280px;max-width:100%;height:64px;min-width:220px;padding:5px 9px 5px 5px;border:1px solid var(--dsw-alias-border-l2,var(--dsh-drag-border));border-radius:14px;background:var(--dsw-alias-bg-layer-3,var(--dsh-drag-bg));color:var(--dsw-alias-label-primary,var(--dsh-drag-text));box-shadow:0 1px 2px rgba(15,23,42,.06);transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease,transform .15s ease}
.dsh-drag-file-main{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;column-gap:10px;min-width:0;height:52px;padding:4px;border:0;border-radius:10px;background:transparent;color:inherit;text-align:left;cursor:pointer;outline:none}
.dsh-drag-file-card:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsh-drag-bg-subtle));border-color:var(--dsw-alias-border-l4,var(--dsh-drag-border));box-shadow:0 3px 10px rgba(15,23,42,.10)}
.dsh-drag-file-card:has(.dsh-drag-file-main:active){transform:translateY(1px)}
.dsh-drag-file-card:has(.dsh-drag-file-main:focus-visible){box-shadow:0 0 0 2px var(--dsw-alias-border-l4,#5b8def),0 3px 10px rgba(15,23,42,.12)}
.dsh-drag-file-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,var(--dsh-drag-bg-subtle));color:var(--dsw-alias-label-secondary,var(--dsh-drag-muted));font:700 9px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.25px}
.dsh-drag-file-icon svg{width:22px;height:22px;fill:currentColor}.dsh-drag-file-icon-pdf{color:#dc4c4c;background:rgba(220,76,76,.12)}.dsh-drag-file-icon-word{color:#3478c7;background:rgba(52,120,199,.12)}.dsh-drag-file-icon-excel{color:#27845a;background:rgba(39,132,90,.12)}.dsh-drag-file-icon-powerpoint{color:#d0643d;background:rgba(208,100,61,.12)}.dsh-drag-file-icon-archive{color:#8a63c9;background:rgba(138,99,201,.12)}.dsh-drag-file-icon-video{color:#b956aa;background:rgba(185,86,170,.12)}.dsh-drag-file-icon-audio{color:#6a65cb;background:rgba(106,101,203,.12)}.dsh-drag-file-icon-code,.dsh-drag-file-icon-text{color:#477f91;background:rgba(71,127,145,.12)}
.dsh-drag-file-copy{display:flex;min-width:0;flex-direction:column;justify-content:center;gap:3px}.dsh-drag-file-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,var(--dsh-drag-text));font:500 13px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.dsh-drag-file-meta{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,var(--dsh-drag-muted));font:400 11px/16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.dsh-drag-file-remove,.dsh-drag-file-preview-close{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary,var(--dsh-drag-muted));font:400 19px/1 sans-serif;cursor:pointer}.dsh-drag-file-remove:hover,.dsh-drag-file-preview-close:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsh-drag-bg-subtle));color:var(--dsw-alias-label-primary,var(--dsh-drag-text))}.dsh-drag-file-remove:focus-visible,.dsh-drag-file-preview-close:focus-visible{outline:2px solid var(--dsw-alias-border-l4,#5b8def);outline-offset:1px}
.dsh-drag-file-preview-backdrop{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:24px;background:rgba(9,13,22,.54);backdrop-filter:blur(4px)}.dsh-drag-file-preview-panel{display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:min(960px,calc(100vw - 48px));height:min(760px,calc(100vh - 48px));min-height:260px;border:1px solid var(--dsw-alias-border-l2,var(--dsh-drag-border));border-radius:16px;overflow:hidden;background:var(--dsw-alias-bg-layer-1,var(--dsh-drag-bg));color:var(--dsw-alias-label-primary,var(--dsh-drag-text));box-shadow:0 24px 80px rgba(0,0,0,.35)}.dsh-drag-file-preview-header{display:flex;align-items:center;gap:16px;min-width:0;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,var(--dsh-drag-border))}.dsh-drag-file-preview-heading{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.dsh-drag-file-preview-heading strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.dsh-drag-file-preview-heading span{color:var(--dsw-alias-label-secondary,var(--dsh-drag-muted));font-size:12px}.dsh-drag-file-preview-content{position:relative;display:grid;min-width:0;min-height:0;place-items:center;overflow:auto;background:var(--dsw-alias-bg-layer-2,var(--dsh-drag-bg-subtle))}.dsh-drag-file-preview-footer{display:flex;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1,var(--dsh-drag-border))}.dsh-drag-file-preview-open{padding:8px 13px;border:1px solid var(--dsw-alias-border-l2,var(--dsh-drag-border));border-radius:9px;background:var(--dsw-alias-bg-layer-3,var(--dsh-drag-bg));color:var(--dsw-alias-label-primary,var(--dsh-drag-text));cursor:pointer}.dsh-drag-file-preview-open:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsh-drag-bg-subtle))}.dsh-drag-file-preview-pdf{width:100%;height:100%;border:0;background:#fff}.dsh-drag-file-preview-video{display:block;max-width:100%;max-height:100%}.dsh-drag-file-preview-audio{width:min(620px,calc(100% - 48px))}.dsh-drag-file-preview-text{align-self:stretch;justify-self:stretch;box-sizing:border-box;margin:0;padding:20px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;color:inherit;background:transparent;font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace}.dsh-drag-file-preview-truncated{position:sticky;right:0;bottom:0;justify-self:stretch;padding:9px 14px;background:var(--dsh-drag-warning-bg);color:var(--dsh-drag-warning-text);font-size:12px}.dsh-drag-file-preview-error{max-width:520px;padding:24px;text-align:center;color:var(--dsh-drag-danger)}
[data-drag-file-notice]{position:fixed;left:50%;bottom:28px;z-index:2147483640;max-width:min(520px,calc(100vw - 32px));transform:translateX(-50%);padding:10px 14px;border:1px solid var(--dsw-alias-border-l2,var(--dsh-drag-border));border-radius:10px;background:var(--dsw-alias-bg-layer-1,var(--dsh-drag-bg));color:var(--dsw-alias-label-primary,var(--dsh-drag-text));box-shadow:0 12px 32px rgba(0,0,0,.22);font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
@media(max-width:520px){.dsh-drag-file-card{width:min(280px,calc(100vw - 48px));min-width:0}.dsh-drag-file-main{grid-template-columns:40px minmax(0,1fr)}.dsh-drag-file-icon{width:40px;height:40px}.dsh-drag-file-preview-backdrop{padding:10px}.dsh-drag-file-preview-panel{width:calc(100vw - 20px);height:calc(100vh - 20px)}}`
  document.head.append(style)
  return () => style.remove()
}

export function mountPillRail(): () => void {
  const ta = findComposer()
  const disposeObserver = ensurePillsObserver(ta)
  renderPills()
  return disposeObserver
}

export function refreshPills(): void { changed() }
