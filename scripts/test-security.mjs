import assert from 'node:assert/strict'
import { access, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FILE_TOKEN_TTL_MS,
  FileTokenRegistry,
  assertContainedFile,
  assertSafeRelativeDirectory,
  classifyFile,
  ensureContainedDirectory,
  inlineDisposition,
  parseSingleRange,
  resolutionDecision,
  streamRegisteredFile,
  systemOpenCommand,
  textPreviewHeaders,
  workspacePathForSession,
  writeUniqueFile,
} from '../src/file-access.js'
import { fullFingerprint as hostFullFingerprint, sampleFingerprint as hostSampleFingerprint } from '../src/fingerprint.js'
import { fullFingerprint as browserFullFingerprint, sampleFingerprint as browserSampleFingerprint } from '../src/client-fingerprint.js'
import { createSideChatExportRegistrar } from '../src/side-chat-bridge.js'
import { acknowledgeRegisteredExport, DRAG_FILE_BRIDGE_VERSION } from '../src/client-export-bridge.js'

const project = resolve(fileURLToPath(new URL('..', import.meta.url)))
const scratch = await mkdtemp(join(tmpdir(), 'dsh-drag-file-security-'))

try {
  const workspace = join(scratch, 'workspace')
  const outside = join(scratch, 'outside')
  await mkdir(workspace)
  await mkdir(outside)
  const source = join(workspace, '中文 name [1].txt')
  await writeFile(source, 'first line\nsecond line', 'utf8')

  let now = 10_000
  const registry = new FileTokenRegistry(() => now)
  const registered = await registry.register(source, 'session-a')
  assert.match(registered.id, /^[A-Za-z0-9_-]{32}$/)
  assert.equal(registered.previewKind, 'text')
  assert.equal((await registry.access('not-a-token', 'session-a')), undefined)
  assert.equal(await registry.access(registered.id, 'session-b'), undefined, 'wrong session must not use a token')
  assert.equal((await registry.access(registered.id, 'session-a'))?.realPath, await realpath(source))
  assert.equal(await registry.openVerified(registered.id, 'session-b'), undefined)
  now += FILE_TOKEN_TTL_MS + 1
  assert.equal(await registry.access(registered.id, 'session-a'), undefined, 'expired token must be rejected')

  const changed = await registry.register(source, 'session-a')
  await writeFile(source, 'changed identity', 'utf8')
  assert.equal(await registry.access(changed.id, 'session-a'), undefined, 'changed file identity must invalidate token')
  const revoked = await registry.register(source, 'session-a')
  assert.equal(registry.revoke(revoked.id, 'session-b'), false, 'wrong session must not revoke a token')
  assert.equal(registry.revoke(revoked.id, 'session-a'), true)
  assert.equal(await registry.access(revoked.id, 'session-a'), undefined)

  const exportRoot = join(scratch, 'side-chat-exports')
  await mkdir(exportRoot)
  const exportSource = join(exportRoot, 'side-chat.md')
  await writeFile(exportSource, '# side chat', 'utf8')
  const outsideFile = join(outside, 'escaped.txt')
  await writeFile(outsideFile, 'outside')
  let bridgeMode = 'resolve'
  const bridge = createSideChatExportRegistrar({
    files: registry,
    registry: { list: () => [{ path: workspace, sessionIds: ['parent-session'] }] },
    config: () => ({ mode: bridgeMode, dropDir: '.drops' }),
    exportRoot,
  })
  const resolveAttachment = await bridge.registerSideChatExport({
    parentSessionId: 'parent-session', sourcePath: exportSource, name: 'side-chat.md', mediaType: 'text/markdown',
  })
  assert.equal(await realpath(resolveAttachment.ref), await realpath(exportSource), 'resolve mode must register the original trusted export')
  await assert.rejects(access(join(workspace, '.dsh-side-chat-exports')), 'resolve mode must not create a workspace export directory')

  bridgeMode = 'copy'
  const copyAttachment = await bridge.registerSideChatExport({
    parentSessionId: 'parent-session', sourcePath: exportSource, name: 'side-chat.md', mediaType: 'text/markdown',
  })
  const copyRoot = await realpath(join(workspace, '.dsh-side-chat-exports'))
  const copyPath = await realpath(copyAttachment.ref)
  const relativeCopy = relative(copyRoot, copyPath)
  assert.equal(relativeCopy !== '' && relativeCopy !== '..' && !relativeCopy.startsWith(`..${sep}`) && !isAbsolute(relativeCopy), true,
    'copy mode bridge ref must be normalized inside the authoritative workspace export directory')
  assert.equal(await readFile(copyPath, 'utf8'), '# side chat', 'copy mode workspace copy must preserve content')
  assert.equal(await readFile(exportSource, 'utf8'), '# side chat', 'copy mode must retain the original exportRoot file')
  await assert.rejects(bridge.registerSideChatExport({
    parentSessionId: 'forged-session', sourcePath: exportSource, name: 'side-chat.md', mediaType: 'text/markdown',
  }))
  await assert.rejects(bridge.registerSideChatExport({
    parentSessionId: 'parent-session', sourcePath: outsideFile, name: 'side-chat.md', mediaType: 'text/markdown',
  }))

  assert.deepEqual(assertSafeRelativeDirectory('attachments/nested-目录'), ['attachments', 'nested-目录'])
  for (const unsafeDropDir of ['', '   ', '.', '..', '../escape', './safe', 'safe/../../escape', 'safe/<escape>', 'C:\\outside', '/outside']) {
    assert.throws(() => assertSafeRelativeDirectory(unsafeDropDir), undefined, `settings must reject unsafe dropDir: ${JSON.stringify(unsafeDropDir)}`)
  }

  let liveSettings = { mode: 'resolve', dropDir: '.drops' }
  const applySettingsLikeRoute = (patch) => {
    const next = { ...liveSettings, ...patch }
    assertSafeRelativeDirectory(next.dropDir)
    liveSettings = next
  }
  applySettingsLikeRoute({ mode: 'copy', dropDir: 'attachments/nested-目录' })
  assert.deepEqual(liveSettings, { mode: 'copy', dropDir: 'attachments/nested-目录' }, 'valid nested relative dropDir must remain supported')
  const settingsBeforeInvalidRequests = { ...liveSettings }
  for (const unsafeDropDir of ['', '..', '../escape', 'safe/../../escape', 'C:\\outside', '/outside']) {
    assert.throws(() => applySettingsLikeRoute({ mode: 'resolve', dropDir: unsafeDropDir }))
    assert.deepEqual(liveSettings, settingsBeforeInvalidRequests, 'rejected settings must not change the previous config')
  }
  assert.equal(workspacePathForSession([{ path: workspace, sessionIds: ['owned'] }], 'owned'), workspace)
  assert.equal(workspacePathForSession([{ path: workspace, sessionIds: ['owned'] }], 'forged'), undefined)
  assert.equal(resolutionDecision('metadata', 10, 1), 'sample-required', 'metadata-only unique candidate must not register')
  assert.equal(resolutionDecision('sample', 10, 0), 'not-found', 'wrong digest must not register')
  assert.equal(resolutionDecision('sample', 10, 1), 'found', 'small sample covers the complete file')
  assert.equal(resolutionDecision('sample', 3 * 64 * 1024 + 1, 1), 'full-required', 'large sample alone must not register')
  assert.equal(resolutionDecision('full', 3 * 64 * 1024 + 1, 1), 'found', 'large file registers only after full proof')

  const smallBytes = Buffer.from('small fingerprint proof')
  const smallPath = join(workspace, 'small.bin')
  await writeFile(smallPath, smallBytes)
  const smallFile = new File([smallBytes], 'small.bin')
  assert.equal(await hostSampleFingerprint(smallPath, smallBytes.length), await browserSampleFingerprint(smallFile))
  assert.equal(await hostFullFingerprint(smallPath), await browserFullFingerprint(smallFile), 'host/client full digest formats must match')
  assert.equal(await hostSampleFingerprint(smallPath, smallBytes.length), await hostFullFingerprint(smallPath), 'small sample must equal full proof')

  const largeBytes = Buffer.alloc(3 * 64 * 1024 + 17, 0x5a)
  const largePath = join(workspace, 'large.bin')
  await writeFile(largePath, largeBytes)
  const largeFile = new File([largeBytes], 'large.bin')
  assert.equal(await hostSampleFingerprint(largePath, largeBytes.length), await browserSampleFingerprint(largeFile))
  assert.equal(await hostFullFingerprint(largePath), await browserFullFingerprint(largeFile))
  const safeDir = await ensureContainedDirectory(workspace, '.drops/child')
  assert.equal(safeDir.directory.startsWith(await realpath(workspace)), true)
  const uniqueA = await writeUniqueFile(safeDir.directory, '同名 file.txt', Buffer.from('a'))
  const uniqueB = await writeUniqueFile(safeDir.directory, '同名 file.txt', Buffer.from('b'))
  assert.notEqual(uniqueA, uniqueB)
  assert.equal(await assertContainedFile(workspace, uniqueA), await realpath(uniqueA))
  await assert.rejects(assertContainedFile(workspace, outsideFile))

  const link = join(workspace, 'link-out')
  let linkCreated = false
  try { await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir'); linkCreated = true } catch {}
  if (linkCreated) await assert.rejects(ensureContainedDirectory(workspace, 'link-out/child'))
  if (linkCreated) await assert.rejects(assertContainedFile(link, outsideFile), 'junction root must never become a trusted root')
  const finalLink = join(workspace, 'final-link.txt')
  let finalLinkCreated = false
  try { await symlink(outsideFile, finalLink, 'file'); finalLinkCreated = true } catch {}
  if (finalLinkCreated) await assert.rejects(assertContainedFile(workspace, finalLink), 'final symlink must be rejected')

  assert.equal(DRAG_FILE_BRIDGE_VERSION, 2)
  const accepted = []
  const validBridgeEvent = new CustomEvent('dsh-drag-file:add-pill', { detail: resolveAttachment, cancelable: true })
  assert.equal(acknowledgeRegisteredExport(validBridgeEvent, 'parent-session', item => accepted.push(item)), true)
  assert.equal(validBridgeEvent.defaultPrevented, true)
  assert.equal(accepted.length, 1)
  const legacyContentEvent = new CustomEvent('dsh-drag-file:add-pill', {
    detail: { path: outsideFile, name: 'forged.md', mediaType: 'text/markdown', text: '# forged' }, cancelable: true,
  })
  assert.equal(acknowledgeRegisteredExport(legacyContentEvent, 'parent-session', item => accepted.push(item)), false)
  assert.equal(legacyContentEvent.defaultPrevented, false, 'legacy browser path/content must not receive an ACK')

  assert.deepEqual(parseSingleRange(undefined, 100), undefined)
  assert.deepEqual(parseSingleRange('bytes=0-9', 100), { start: 0, end: 9 })
  assert.deepEqual(parseSingleRange('bytes=90-', 100), { start: 90, end: 99 })
  assert.deepEqual(parseSingleRange('bytes=-5', 100), { start: 95, end: 99 })
  assert.equal(parseSingleRange('bytes=101-102', 100), null)
  assert.equal(parseSingleRange('bytes=0-1,4-5', 100), null)

  const streamEntry = {
    path: source, realPath: source, sessionId: 'session-a', name: 'head.txt', size: 100,
    mtimeMs: 1, dev: 1, ino: 1, mediaType: 'text/plain', typeLabel: '文本', previewKind: 'text', expiresAt: 1,
  }
  for (const [rangeHeader, expectedStatus] of [[undefined, 200], ['bytes=0-9', 206], ['bytes=101-102', 416]]) {
    let closes = 0
    let streams = 0
    let ended = 0
    let status
    const lifecycle = []
    const handle = {
      close: async () => { lifecycle.push('close'); closes += 1 },
      createReadStream: () => { streams += 1; throw new Error('HEAD must not create a stream') },
    }
    const response = {
      writeHead: (next) => { status = next },
      end: () => { lifecycle.push('end'); ended += 1 },
      once: () => response,
      off: () => response,
      destroy: () => {},
    }
    await streamRegisteredFile(response, streamEntry, rangeHeader, true, handle)
    assert.equal(status, expectedStatus)
    assert.equal(closes, 1, `${expectedStatus} HEAD must close its verified handle exactly once`)
    assert.equal(streams, 0, `${expectedStatus} HEAD must not create a stream`)
    assert.equal(ended, 1)
    assert.deepEqual(lifecycle, ['close', 'end'], `${expectedStatus} HEAD must await close before response end`)
  }

  assert.deepEqual(classifyFile('report.pdf'), { mediaType: 'application/pdf', typeLabel: 'PDF', previewKind: 'pdf' })
  assert.equal(classifyFile('movie.mp4').previewKind, 'video')
  assert.equal(classifyFile('sound.mp3').previewKind, 'audio')
  assert.equal(classifyFile('archive.zip').previewKind, 'system')
  assert.equal(classifyFile('unknown.bin').previewKind, 'system')
  assert.match(inlineDisposition('中文 name.pdf'), /^inline; /)

  const maliciousHtml = '<svg onload="globalThis.pwned=1"><script>globalThis.pwned=2</script></svg>'
  const maliciousPath = join(workspace, '恶意.html')
  await writeFile(maliciousPath, maliciousHtml, 'utf8')
  const maliciousAttachment = await registry.register(maliciousPath, 'session-a')
  assert.equal(maliciousAttachment.mediaType, 'text/html', 'HTML mediaType remains UI metadata')
  assert.equal(maliciousAttachment.previewKind, 'text')
  const maliciousHeaders = textPreviewHeaders(maliciousAttachment, Buffer.byteLength(maliciousHtml), false)
  assert.equal(maliciousHeaders['content-type'], 'text/plain; charset=utf-8')
  assert.equal(maliciousHeaders['content-security-policy'], "sandbox; default-src 'none'; base-uri 'none'")
  assert.equal(maliciousHeaders['x-content-type-options'], 'nosniff')
  assert.equal(maliciousHeaders['cache-control'], 'private, no-store, max-age=0')
  assert.match(String(maliciousHeaders['content-disposition']), /^inline; /)
  assert.doesNotMatch(String(maliciousHeaders['content-type']), /text\/html|image\/svg\+xml/)
  assert.equal(classifyFile('恶意.svg').previewKind, 'system', 'SVG must never enter the text preview handler')

  const win = systemOpenCommand('C:\\safe path\\file.pdf', 'win32')
  assert.equal(win.command, 'explorer.exe')
  assert.deepEqual(win.args, ['C:\\safe path\\file.pdf'])
  assert.equal(win.options.shell, false)
  assert.equal(win.args.length, 1)

  const protocol = await readFile(join(project, 'src', 'protocol.ts'), 'utf8')
  assert.doesNotMatch(protocol, /workspacePaths|currentWorkspacePath|readonly candidates/)
  const client = await readFile(join(project, 'src', 'client', 'index.ts'), 'utf8')
  assert.doesNotMatch(client, /REGISTER_EXPORT_ROUTE|register-export|detail\.path|detail\.text|pathsFromDrop/)
  assert.doesNotMatch(client, /__dshDragFileActive/)
  assert.match(client, /__dshDragFileBridgeVersion/)
  const pills = await readFile(join(project, 'src', 'client', 'pills.ts'), 'utf8')
  assert.match(pills, /conversation\.input\.attachments/)
  assert.match(pills, /flex-direction:column!important;align-items:stretch!important;gap:8px!important/)
  const railSource = await readFile(join(project, 'src', 'client', 'rail.ts'), 'utf8')
  assert.match(railSource, /dsh-side-chat-parent-annotation-rail/)
  assert.match(railSource, /placePillBar\(slot: HTMLElement, bar\?: HTMLElement\)/)
  assert.match(pills, /if \(items\.length === 0\) \{[\s\S]*?placePillBar\(slot\)/)
  assert.match(pills, /width:280px;max-width:100%;height:64px/)
  assert.match(pills, /main = document\.createElement\('button'\)/)
  assert.doesNotMatch(pills, /card\.setAttribute\('role', 'button'\)/)
  assert.doesNotMatch(railSource, /function stopPropagation[^}]*preventDefault/)
  assert.match(railSource, /\['pointerdown', 'mousedown', 'keydown'\]/)
  assert.match(railSource, /data-drag-file-native-inner/)
  assert.doesNotMatch(pills, /--dsw-alias-(?:surface|fg|line|focus-ring|warning|danger)/)
  assert.match(pills, /--dsw-alias-bg-layer-3/)
  assert.match(pills, /--dsw-alias-label-primary/)
  assert.match(pills, /--dsw-alias-border-l2/)
  assert.match(pills, /data-theme="dark"/)
  assert.match(pills, /data-theme="light"/)
  assert.ok(pills.indexOf('@media(prefers-color-scheme:dark)') < pills.indexOf(':root[color-scheme="light"]'), 'explicit DSH themes must override the OS preference fallback')
  const preview = await readFile(join(project, 'src', 'client', 'preview.ts'), 'utf8')
  assert.match(preview, /event\.key === 'Escape'/)
  assert.match(preview, /trigger\.focus\(\)/)
  assert.match(preview, /method: 'HEAD'/)
  assert.match(preview, /PDF 预览加载超时/)
  assert.match(preview, /iframe\.addEventListener\('error'/)
  assert.match(preview, /response\.headers\.get\('x-dsh-drag-file-truncated'\)/)
  const host = await readFile(join(project, 'src', 'index.ts'), 'utf8')
  const sideBridge = await readFile(join(project, 'src', 'side-chat-bridge.ts'), 'utf8')
  const fileAccessSource = await readFile(join(project, 'src', 'file-access.ts'), 'utf8')
  const settingsValidation = host.indexOf('assertSafeRelativeDirectory(next.dropDir)')
  const settingsAssignment = host.indexOf('config = next', settingsValidation)
  const settingsPersistence = host.indexOf("settings?.replace?.(SETTINGS_NAMESPACE, { ...next })", settingsValidation)
  assert.ok(settingsValidation >= 0 && settingsValidation < settingsAssignment, 'settings route must validate dropDir before replacing live config')
  assert.ok(settingsAssignment < settingsPersistence, 'validated settings may be persisted only after the live config transaction point')
  assert.doesNotMatch(host, /REGISTER_EXPORT_ROUTE|register-export/)
  assert.match(sideBridge, /DragFileConfig/)
  assert.match(sideBridge, /input\.config\(\)\.mode\s*===\s*['"]resolve['"]/)
  assert.match(sideBridge, /registerContained\(request\.sourcePath, input\.exportRoot/)
  assert.match(sideBridge, /readContainedFile\(input\.exportRoot, request\.sourcePath, MAX_SIDE_CHAT_EXPORT_BYTES\)/)
  assert.match(sideBridge, /copyBytesToDropDir\(workspacePath, '\.dsh-side-chat-exports'/)
  assert.doesNotMatch(host, /cmd\s*\/c|shell:\s*true/)
  assert.match(host, /workspaceForSession/)
  assert.match(host, /textPreviewHeaders\(entry, body\.length, entry\.size > TEXT_READ_BYTES\)/)
  assert.doesNotMatch(host, /'content-type': `\$\{entry\.mediaType\}; charset=utf-8`/)
  assert.match(fileAccessSource, /'content-type': 'text\/plain; charset=utf-8'/)
  assert.match(fileAccessSource, /'content-security-policy': "sandbox; default-src 'none'; base-uri 'none'"/)
  assert.match(fileAccessSource, /x-dsh-drag-file-truncated/)
  assert.match(host, /assertContainedFile/)
  assert.match(client, /addEventListener\('pagehide'/)
  assert.match(client, /sendBeacon/)
  assert.match(client, /keepalive/)

  const sideAdapter = await readFile(join(project, '..', '20260822-dsh-side-chat++', 'src', 'client', 'rc6', 'sessions-adapter.ts'), 'utf8')
  const sideExportBridge = await readFile(join(project, '..', '20260822-dsh-side-chat++', 'src', 'client', 'rc6', 'export-bridge.ts'), 'utf8')
  assert.match(sideAdapter, /dispatchDragFileAttachment\(window, parentSessionId, attachment\)/)
  assert.match(sideExportBridge, /detail:\s*attachment/)
  assert.doesNotMatch(`${sideAdapter}\n${sideExportBridge}`, /detail:\s*\{[^}]*(?:text:|path:\s*savedPath)/)

  console.log('security/UI contract tests passed: proof-gated resolution, safe transactional settings, matching fingerprints, token lifecycle, containment recheck, Range/MIME, safe open argv, real DSH tokens, native buttons, preview cleanup, pagehide revoke, host-registered capability bridge')
} finally {
  await rm(scratch, { recursive: true, force: true })
}
