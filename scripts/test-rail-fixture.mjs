import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const project = resolve(fileURLToPath(new URL('..', import.meta.url)))
const playwrightRoot = process.env.CODEX_PLAYWRIGHT_ROOT
  ?? join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')
const playwrightEntry = join(playwrightRoot, 'index.mjs')
await access(playwrightEntry)
const { chromium } = await import(pathToFileURL(playwrightEntry).href)
const edge = process.env.DSH_EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
await access(edge)

const browser = await chromium.launch({ executablePath: edge, headless: true })
try {
  const page = await browser.newPage()
  await page.setContent(`<!doctype html><style>
    [data-slot="conversation.input.attachments"]{display:flex;flex-direction:column;gap:8px}
    [data-drag-file-native-inner]{display:flex;flex-wrap:wrap;overflow:visible;height:auto}
    [data-drag-file-native-inner]>[data-drag-file-pills]{display:contents}
    .dsh-drag-file-preview-backdrop{position:fixed;inset:0}
    .dsh-drag-file-preview-panel{position:absolute;left:100px;top:100px;width:400px;height:300px}
  </style><div data-slot="conversation.input.attachments">
    <div class="dsh-side-chat-parent-annotation-rail">1 条引用</div>
  </div>`)
  await page.addScriptTag({ content: await readFile(join(project, 'src', 'client', 'rail-fixture.js'), 'utf8') })
  await page.addScriptTag({ content: await readFile(join(project, 'src', 'client', 'preview-fixture.js'), 'utf8') })
  const result = await page.evaluate(async () => {
    const api = window.__DshDragFileRailFixture
    const slot = document.querySelector('[data-slot="conversation.input.attachments"]')
    const reference = slot.querySelector('.dsh-side-chat-parent-annotation-rail')
    const waitForObserver = () => new Promise(resolvePromise => setTimeout(resolvePromise, 80))
    const makeNativeRail = () => {
      const wrapper = document.createElement('div')
      const inner = document.createElement('div')
      inner.setAttribute('role', 'group')
      inner.append(document.createElement('button'))
      wrapper.append(inner)
      return { wrapper, inner }
    }
    const makeBar = () => {
      const bar = document.createElement('div')
      bar.setAttribute('data-drag-file-pills', '1')
      const card = document.createElement('div')
      card.className = 'dsh-drag-file-card'
      bar.append(card)
      return bar
    }

    api.placePillBar(slot)
    const onlyReference = slot.children.length === 1
      && slot.firstElementChild === reference
      && slot.querySelector('[data-drag-file-pills]') === null

    const observerSlot = document.createElement('div')
    observerSlot.setAttribute('data-slot', 'conversation.input.attachments')
    const observerReference = document.createElement('div')
    observerReference.className = 'dsh-side-chat-parent-annotation-rail'
    observerReference.textContent = '1 条引用'
    observerSlot.append(observerReference)
    document.body.append(observerSlot)
    api.placePillBar(observerSlot)
    const stopObserver = api.startAttachmentRailObserver(observerSlot, () => api.placePillBar(observerSlot), 20)
    const observedA = makeNativeRail()
    observerSlot.insertBefore(observedA.wrapper, observerReference)
    await waitForObserver()
    const observerInserted = observedA.wrapper.hasAttribute('data-drag-file-native-wrapper')
      && observedA.inner.hasAttribute('data-drag-file-native-inner')
    const observedB = makeNativeRail()
    observedA.wrapper.replaceWith(observedB.wrapper)
    await waitForObserver()
    const observerReplaced = observedB.wrapper.hasAttribute('data-drag-file-native-wrapper')
      && observedB.inner.hasAttribute('data-drag-file-native-inner')
      && !observedA.wrapper.hasAttribute('data-drag-file-native-wrapper')
      && !observedA.inner.hasAttribute('data-drag-file-native-inner')
    observedB.wrapper.remove()
    await waitForObserver()
    const observerRemovedWithoutBar = observerSlot.querySelector('[data-drag-file-pills]') === null
      && !observedB.wrapper.hasAttribute('data-drag-file-native-wrapper')
      && !observedB.inner.hasAttribute('data-drag-file-native-inner')
    const observedC = makeNativeRail()
    observerSlot.insertBefore(observedC.wrapper, observerReference)
    await waitForObserver()
    const observerRestored = observedC.wrapper.hasAttribute('data-drag-file-native-wrapper')
      && observedC.inner.hasAttribute('data-drag-file-native-inner')
      && observerSlot.querySelector('[data-drag-file-pills]') === null
    stopObserver()

    const wrapper = document.createElement('div')
    const inner = document.createElement('div')
    inner.setAttribute('role', 'group')
    const image = document.createElement('button')
    image.textContent = 'image'
    inner.append(image)
    wrapper.append(inner)
    slot.insertBefore(wrapper, reference)
    api.placePillBar(slot)
    const noFileMarkers = wrapper.hasAttribute('data-drag-file-native-wrapper')
      && inner.hasAttribute('data-drag-file-native-inner')
      && slot.querySelector('[data-drag-file-pills]') === null
    const referenceOwnRow = wrapper.parentElement === slot
      && reference.parentElement === slot
      && wrapper.nextElementSibling === reference
      && getComputedStyle(slot).flexDirection === 'column'
      && getComputedStyle(slot).gap === '8px'

    const onlyImageSlot = document.createElement('div')
    onlyImageSlot.setAttribute('data-slot', 'conversation.input.attachments')
    const onlyImageWrapper = document.createElement('div')
    const onlyImageInner = document.createElement('div')
    onlyImageInner.setAttribute('role', 'group')
    onlyImageInner.append(document.createElement('button'))
    onlyImageWrapper.append(onlyImageInner)
    onlyImageSlot.append(onlyImageWrapper)
    document.body.append(onlyImageSlot)
    api.placePillBar(onlyImageSlot)
    const onlyImage = onlyImageWrapper.hasAttribute('data-drag-file-native-wrapper')
      && onlyImageInner.hasAttribute('data-drag-file-native-inner')
      && onlyImageSlot.querySelector('[data-drag-file-pills]') === null

    wrapper.remove()
    let bar = makeBar()
    slot.insertBefore(bar, reference)
    api.placePillBar(slot, bar)
    const directBeforeNative = bar.parentElement === slot && bar.nextElementSibling === reference

    slot.insertBefore(wrapper, reference)
    api.placePillBar(slot, bar)
    const migratedIntoInner = bar.parentElement === inner
    const sameEffectiveFlexParent = image.parentElement === bar.parentElement
      && getComputedStyle(bar).display === 'contents'
      && bar.firstElementChild?.classList.contains('dsh-drag-file-card') === true
    const innerStyle = getComputedStyle(inner)
    const flexWrap = innerStyle.flexWrap
    const overflow = innerStyle.overflow

    wrapper.remove()
    bar = makeBar()
    slot.insertBefore(bar, reference)
    api.placePillBar(slot, bar)
    const rebuiltDirect = bar.parentElement === slot && bar.nextElementSibling === reference

    const wrapper2 = document.createElement('div')
    const inner2 = document.createElement('div')
    inner2.setAttribute('role', 'group')
    inner2.append(document.createElement('button'))
    wrapper2.append(inner2)
    slot.insertBefore(wrapper2, reference)
    api.placePillBar(slot, bar)

    const actionCard = document.createElement('div')
    const main = document.createElement('button')
    main.id = 'fixture-main'
    const remove = document.createElement('button')
    remove.id = 'fixture-remove'
    actionCard.append(main, remove)
    document.body.append(actionCard)
    window.fixtureCounts = { activated: 0, removed: 0, wrapperClicks: 0 }
    actionCard.addEventListener('click', () => { window.fixtureCounts.wrapperClicks += 1 })
    api.wireAttachmentCardActions(
      main,
      remove,
      () => { window.fixtureCounts.activated += 1 },
      () => { window.fixtureCounts.removed += 1 },
    )
    return {
      onlyReference,
      observerInserted,
      observerReplaced,
      observerRemovedWithoutBar,
      observerRestored,
      noFileMarkers,
      referenceOwnRow,
      onlyImage,
      directBeforeNative,
      migratedIntoInner,
      sameEffectiveFlexParent,
      rebuiltDirect,
      remigrated: bar.parentElement === inner2,
      markers: wrapper2.hasAttribute('data-drag-file-native-wrapper') && inner2.hasAttribute('data-drag-file-native-inner'),
      flexWrap,
      overflow,
    }
  })
  assert.deepEqual(result, {
    onlyReference: true,
    observerInserted: true,
    observerReplaced: true,
    observerRemovedWithoutBar: true,
    observerRestored: true,
    noFileMarkers: true,
    referenceOwnRow: true,
    onlyImage: true,
    directBeforeNative: true,
    migratedIntoInner: true,
    sameEffectiveFlexParent: true,
    rebuiltDirect: true,
    remigrated: true,
    markers: true,
    flexWrap: 'wrap',
    overflow: 'visible',
  })
  await page.locator('#fixture-main').focus()
  await page.keyboard.press('Enter')
  assert.deepEqual(await page.evaluate(() => window.fixtureCounts), { activated: 1, removed: 0, wrapperClicks: 1 })
  await page.locator('#fixture-remove').focus()
  await page.keyboard.press('Space')
  assert.deepEqual(await page.evaluate(() => window.fixtureCounts), { activated: 1, removed: 1, wrapperClicks: 1 })

  await page.evaluate(() => {
    window.fetch = async () => new Response('fixture preview', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-dsh-drag-file-truncated': '0' },
    })
    const trigger = document.createElement('button')
    trigger.id = 'preview-trigger'
    trigger.textContent = 'preview trigger'
    document.body.append(trigger)
    window.openFixturePreview = () => {
      trigger.focus()
      window.__DshDragFilePreviewFixture.activateAttachment({
        id: 'fixture-token',
        ref: 'workspace/fixture.txt',
        name: 'fixture.txt',
        size: 15,
        mediaType: 'text/plain',
        typeLabel: '文本',
        previewKind: 'text',
        sessionId: 'fixture-session',
        formattedSize: '15 B',
      }, trigger)
    }
    window.openFixturePreview()
  })
  await page.locator('.dsh-drag-file-preview-panel').click({ position: { x: 20, y: 20 } })
  assert.equal(await page.locator('[data-drag-file-preview]').count(), 1, 'clicking inside the panel must not close the preview')
  await page.mouse.click(5, 5)
  await page.locator('[data-drag-file-preview]').waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'preview-trigger', 'backdrop pointer/click close must restore trigger focus')
  await page.evaluate(() => window.openFixturePreview())
  await page.keyboard.press('Escape')
  await page.locator('[data-drag-file-preview]').waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'preview-trigger', 'Escape close must continue to restore trigger focus')
  console.log('rail/preview fixture passed: real observer coordination, shared rail, backdrop and Escape focus restoration')
} finally {
  await browser.close()
}
