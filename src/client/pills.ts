/**
 * Codex-style file pill rail: rendered in the composer attachment rail (same
 * row as native image thumbnails), showing icon + name + size with a remove
 * button — never the raw path. DOM injection + MutationObserver rebuild
 * pattern adapted from loudMore/dsh-drop-to-path (MIT).
 */

export interface Pill {
  path: string
  name: string
  size: number
}

/** Non-image files queued in this page, in drop order. */
export const fileQueue: Pill[] = []

let onChange: (() => void) | null = null

/** The queue changed (added/removed/cleared). */
export function setPillChangeListener(listener: (() => void) | null): void {
  onChange = listener
}

function changed(): void {
  renderPills()
  if (onChange) onChange()
}

export function addPill(pill: Pill): void {
  fileQueue.push(pill)
  changed()
}

export function removePill(path: string): void {
  const index = fileQueue.findIndex((item) => item.path === path)
  if (index >= 0) {
    fileQueue.splice(index, 1)
    changed()
  }
}

export function clearPills(): void {
  fileQueue.length = 0
  changed()
}

export function pillsList(): readonly Pill[] {
  return fileQueue
}

import { FILE_ICONS } from './icons.js'

/**
 * Icon strategy (per user decision): common types render a real icon glyph
 * from the vendored Bootstrap Icons set; every other type falls back to the
 * file extension itself rendered as text — so no per-extension icon hunting
 * is ever needed.
 */
export function fileKind(name: string): { icon?: string; ext?: string } {
  const n = String(name || '').toLowerCase()
  const ext = (n.split('.').at(-1) ?? '').trim()
  if (ext === 'pdf') return { icon: FILE_ICONS.pdf }
  if (/^docx?$/.test(ext)) return { icon: FILE_ICONS.doc }
  if (/^xlsx?$/.test(ext)) return { icon: FILE_ICONS.xls }
  if (/^pptx?$/.test(ext)) return { icon: FILE_ICONS.ppt }
  if (/^(zip|rar|7z|tar|gz)$/.test(ext)) return { icon: FILE_ICONS.zip }
  if (/^(mp4|mov|webm|mkv|avi)$/.test(ext)) return { icon: FILE_ICONS.vid }
  if (/^(mp3|wav|flac|m4a)$/.test(ext)) return { icon: FILE_ICONS.aud }
  if (/^(py|js|ts|tsx|jsx|go|rs|java|c|cpp|h|sh|ps1|sql)$/.test(ext)) return { icon: FILE_ICONS.code }
  if (/^(txt|md|csv|json|ndjson|log|yaml|yml|toml|xml|html|css)$/.test(ext)) return { icon: FILE_ICONS.text }
  // Unknown types: render the extension itself as the icon.
  if (ext.length > 0) return { ext: ext.toUpperCase().slice(0, 4) }
  return { icon: FILE_ICONS.file }
}

/** A file-type icon as an inline SVG element. */
export function fileIconElement(name: string, size = 20): HTMLElement {
  const kind = fileKind(name)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'currentColor')
  svg.setAttribute('aria-hidden', 'true')
  if (kind.icon) {
    svg.innerHTML = kind.icon
    return svg
  }
  // Extension-as-icon: a small rounded square with the extension letters.
  svg.remove()
  const tile = document.createElement('span')
  tile.textContent = kind.ext ?? ''
  tile.style.cssText = 'flex:none;min-width:24px;height:24px;padding:0 3px;box-sizing:border-box;' +
    'display:grid;place-items:center;border-radius:5px;' +
    'background:var(--dsw-alias-surface-raised, rgba(148,163,184,.14));' +
    'color:var(--dsw-alias-fg-secondary, #94a3b8);' +
    'font:700 8px/1 -apple-system, BlinkMacSystemFont, sans-serif;letter-spacing:.2px'
  return tile
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const PILLS_ATTR = 'data-drag-file-pills'

/** The DSH composer input. */
function findComposer(): HTMLTextAreaElement | null {
  return document.querySelector('textarea')
}

/** DSH attachment rail container (class suffix is stable per build). */
function findRail(): HTMLElement | null {
  return document.querySelector('[class*="_attachments"]')
}

/** Composer card container that also owns the rail. */
function findCard(ta: HTMLTextAreaElement): HTMLElement | null {
  const scroll = ta.parentElement && ta.parentElement.parentElement
  return scroll ? scroll.parentElement : null
}

function renderPills(): void {
  const ta = findComposer()
  if (!ta) return
  const old = document.querySelector(`[${PILLS_ATTR}]`)
  if (old) old.remove()
  if (fileQueue.length === 0) return

  const bar = document.createElement('div')
  bar.setAttribute(PILLS_ATTR, '1')
  bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:2px 0'

  for (const item of fileQueue) {
    // Codex/ChatGPT card anatomy: rounded card with a theme-coordinated
    // border/fill (tracks the DSH surface tokens), small type icon, filename,
    // size, remove.
    const pill = document.createElement('span')
    pill.style.cssText = 'position:relative;display:inline-flex;align-items:center;gap:9px;' +
      'box-sizing:border-box;max-width:340px;height:36px;padding:0 10px 0 8px;' +
      'border:1px solid var(--dsw-alias-line-normal, rgba(148,163,184,.35));' +
      'background:var(--dsw-alias-surface-raised, rgba(148,163,184,.08));' +
      'border-radius:10px;overflow:hidden;transition:border-color .12s ease,background-color .12s ease'
    pill.addEventListener('mouseenter', () => {
      pill.style.borderColor = 'var(--dsw-alias-line-strong, rgba(148,163,184,.6))'
      pill.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(148,163,184,.14))'
    })
    pill.addEventListener('mouseleave', () => {
      pill.style.borderColor = 'var(--dsw-alias-line-normal, rgba(148,163,184,.35))'
      pill.style.background = 'var(--dsw-alias-surface-raised, rgba(148,163,184,.08))'
    })

    const tile = fileIconElement(item.name, 18)

    const name = document.createElement('span')
    name.textContent = item.name
    name.title = item.name
    name.style.cssText = 'flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'font:13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif;' +
      'color:var(--dsw-alias-fg-primary, #e2e8f0)'

    const size = document.createElement('span')
    const formatted = formatSize(item.size)
    size.textContent = formatted
    size.style.cssText = 'flex:none;font:11px/1.4 -apple-system, BlinkMacSystemFont, sans-serif;' +
      'color:var(--dsw-alias-fg-tertiary, #9aa7bd)'

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.textContent = '✕'
    remove.title = '移除附件'
    remove.style.cssText = 'flex:none;width:18px;height:18px;display:inline-flex;align-items:center;' +
      'justify-content:center;border:0;border-radius:50%;cursor:pointer;' +
      'background:rgba(0,0,0,.28);color:var(--dsw-alias-fg-secondary, #cbd5e1);' +
      'font-size:10px;line-height:1;padding:0'
    remove.addEventListener('click', () => { removePill(item.path) })

    pill.append(tile, name, size, remove)
    bar.append(pill)
  }

  // Same row as image thumbnails when the rail exists; otherwise the top of
  // the composer card, right above the scroll area.
  const rail = findRail()
  if (rail) {
    rail.appendChild(bar)
  } else {
    const card = findCard(ta)
    if (!card) return
    const scroll = ta.parentElement?.parentElement
    if (scroll) card.insertBefore(bar, scroll)
  }
}

// Rebuild pills if a React re-render of the rail/card removed them.
let chipsTimer: ReturnType<typeof setTimeout> | undefined
function ensurePillsObserver(ta: HTMLTextAreaElement): () => void {
  const card = findCard(ta)
  if (!card) return () => {}
  const observer = new MutationObserver(() => {
    if (fileQueue.length > 0 && document.querySelector(`[${PILLS_ATTR}]`) === null) {
      if (chipsTimer !== undefined) clearTimeout(chipsTimer)
      chipsTimer = setTimeout(renderPills, 60)
    }
  })
  observer.observe(card, { childList: true, subtree: true })
  return () => observer.disconnect()
}

/** Keep the native image rail laying out horizontally with the pills. */
export function injectRailStyle(): () => void {
  const style = document.createElement('style')
  style.id = 'dsh-drag-file-style'
  style.textContent = '[class*="_attachments"]{display:flex;flex-wrap:wrap;align-items:center;gap:8px}'
  document.head.append(style)
  return () => style.remove()
}

/** Mount the pill rail into the composer and watch for React re-renders. */
export function mountPillRail(): () => void {
  const ta = findComposer()
  const disposeObserver = ta ? ensurePillsObserver(ta) : () => {}
  renderPills()
  return disposeObserver
}
