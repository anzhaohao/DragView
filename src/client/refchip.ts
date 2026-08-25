/**
 * Post-send refChip upgrade: the platform renders each `@"<path>"` mention in a
 * sent message as a `<span data-ref-chip="file" title="@\"<path>\"">` holding a
 * 16px icon + the bare file name. We upgrade that chip to the same read-only
 * Codex-style card shown in the composer (icon tile + name + "type · size"),
 * and re-connect click/keyboard to the existing preview/open path.
 *
 * The fileId lives in the client-side sentRefs map populated on send
 * (pills.rememberSentPills); the host token is still live (it is no longer
 * revoked on send). After a page reload the map is empty, so history chips
 * degrade to a non-clickable card shell — never a weaker security posture.
 */
import { activateAttachment } from './preview.js'
import { fileIconElement, sentPillForPath } from './pills.js'

const ENHANCED_ATTR = 'data-drag-file-enhanced'

function pathFromRefChip(chip: HTMLElement): string {
  const title = chip.getAttribute('title') ?? ''
  // title is the raw `@"<path>"` token — same strip as DSH's displayLabel.
  return title.slice(1).replace(/^"|"$/g, '')
}

function enhanceRefChip(chip: HTMLElement): void {
  if (chip.hasAttribute(ENHANCED_ATTR)) return
  chip.setAttribute(ENHANCED_ATTR, '1')
  chip.classList.add('dsh-drag-file-sent')

  const pill = sentPillForPath(pathFromRefChip(chip))
  const name = pill?.name ?? ((chip.textContent ?? '').trim() || '文件')

  const tile = fileIconElement(name)
  const copy = document.createElement('span')
  copy.className = 'dsh-drag-file-copy'
  const nameEl = document.createElement('span')
  nameEl.className = 'dsh-drag-file-name'
  nameEl.textContent = name
  nameEl.title = name
  const meta = document.createElement('span')
  meta.className = 'dsh-drag-file-meta'
  meta.textContent = pill ? `${pill.typeLabel} · ${pill.formattedSize}` : '文件 · 大小未知'
  copy.append(nameEl, meta)
  chip.replaceChildren(tile, copy)
  // Never surface the absolute path to the user (matches the composer card).
  chip.removeAttribute('title')

  if (pill === undefined) return

  chip.setAttribute('data-preview-kind', pill.previewKind)
  chip.setAttribute('role', 'button')
  chip.setAttribute('tabindex', '0')
  chip.setAttribute('aria-label', `${pill.name}，${pill.typeLabel}，${pill.formattedSize}`)
  const activate = (): void => { activateAttachment(pill, chip) }
  chip.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    activate()
  })
  chip.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate()
    }
  })
}

function enhanceRefChipsIn(root: ParentNode): void {
  root.querySelectorAll('[data-ref-chip="file"]').forEach((node) => enhanceRefChip(node as HTMLElement))
}

function injectRefChipStyle(): void {
  if (document.getElementById('dsh-drag-file-refchip-style')) return
  const style = document.createElement('style')
  style.id = 'dsh-drag-file-refchip-style'
  style.textContent = `
[data-ref-chip="file"].dsh-drag-file-sent{display:inline-flex;align-items:center;gap:10px;box-sizing:border-box;max-width:min(280px,100%);min-width:0;padding:5px 12px 5px 5px;border:1px solid var(--dsw-alias-border-l2,var(--dsh-drag-border));border-radius:14px;background:var(--dsw-alias-bg-layer-3,var(--dsh-drag-bg));color:var(--dsw-alias-label-primary,var(--dsh-drag-text));vertical-align:middle;white-space:nowrap;box-shadow:0 1px 2px rgba(15,23,42,.06)}
[data-ref-chip="file"].dsh-drag-file-sent[role="button"]{cursor:pointer}
[data-ref-chip="file"].dsh-drag-file-sent[role="button"]:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsh-drag-bg-subtle));border-color:var(--dsw-alias-border-l4,var(--dsh-drag-border))}
[data-ref-chip="file"].dsh-drag-file-sent[role="button"]:focus-visible{outline:2px solid var(--dsw-alias-border-l4,#5b8def);outline-offset:1px}
[data-ref-chip="file"].dsh-drag-file-sent .dsh-drag-file-copy{flex:1;min-width:0}
[data-ref-chip="file"].dsh-drag-file-sent .dsh-drag-file-icon{flex:none}
`
  document.head.append(style)
}

export function startRefChipObserver(): () => void {
  injectRefChipStyle()
  enhanceRefChipsIn(document)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        if (node.matches('[data-ref-chip="file"]')) enhanceRefChip(node)
        else node.querySelectorAll('[data-ref-chip="file"]').forEach((chip) => enhanceRefChip(chip as HTMLElement))
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}
