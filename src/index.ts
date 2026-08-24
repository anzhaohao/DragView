import type { IncomingMessage, ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { copyBytesToDropDir, MAX_COPY_BYTES, safeName } from './copy.js'
import {
  assertContainedFile,
  assertSafeRelativeDirectory,
  FileTokenRegistry,
  MAX_RESOLUTIONS,
  openWithSystem,
  resolutionDecision,
  RESOLUTION_TTL_MS,
  streamRegisteredFile,
  textPreviewHeaders,
  workspacePathForSession,
} from './file-access.js'
import { matchingFileDigest, metadataCandidates, validDroppedFile } from './locator.js'
import {
  CONFIG_ROUTE,
  COPY_ROUTE,
  MAX_TEXT_FILE_BYTES,
  OPEN_ROUTE,
  PREVIEW_ROUTE,
  RESOLVE_ROUTE,
  REVOKE_ROUTE,
  SETTINGS_ROUTE,
  TEXT_PREVIEW_ROUTE,
  TEXT_READ_BYTES,
  type DragFileConfig,
  type DroppedFileMeta,
  type LocateRequest,
  type LocateResponse,
  type RegisteredFile,
} from './protocol.js'
import { createSideChatExportRegistrar, type DshDragFileHostService } from './side-chat-bridge.js'

export { FileTokenRegistry, assertContainedFile, assertSafeRelativeDirectory, classifyFile, ensureContainedDirectory, inlineDisposition, parseSingleRange, resolutionDecision, systemOpenCommand, workspacePathForSession } from './file-access.js'

export const SETTINGS_NAMESPACE = settingsNamespace('drag-file')

const SETTINGS_SCHEMA = z.object({
  mode: z.union([z.const('resolve'), z.const('copy')]).default('resolve'),
  dropDir: z.string().default('.drops'),
})
const DEFAULT_CONFIG: DragFileConfig = { mode: 'resolve', dropDir: '.drops' }
const MAX_BODY_BYTES = 140 * 1024 * 1024

interface WorkspaceLike {
  readonly path: string
  readonly sessionIds?: readonly string[]
}

interface WorkspaceRegistryLike {
  list(): WorkspaceLike[]
}

interface Resolution {
  readonly file: DroppedFileMeta
  readonly sessionId: string
  candidates: string[]
  readonly choices: Map<string, string>
  stage: 'sample' | 'full' | 'choose'
  expiresAt: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshDragFileHost: DshDragFileHostService
  }
}

async function readJsonBody(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

function opaqueId(): string { return randomBytes(24).toString('base64url') }

function queryId(req: IncomingMessage): string | undefined {
  try { return new URL(req.url ?? '', 'http://localhost').searchParams.get('id') ?? undefined } catch { return undefined }
}

function querySessionId(req: IncomingMessage): string | undefined {
  try { return new URL(req.url ?? '', 'http://localhost').searchParams.get('sessionId') ?? undefined } catch { return undefined }
}

function sideChatExportRoot(): string {
  const dshHome = process.env.DSH_HOME || process.env.HANAKO_DSH_HOME
  return dshHome
    ? path.join(path.resolve(dshHome), '.dsh-side-chat-plus-plus', 'side-chat-exports')
    : path.join(os.tmpdir(), 'dsh-side-chat-plus-plus', 'side-chat-exports')
}

function workspaceForSession(registry: WorkspaceRegistryLike, sessionId: unknown): WorkspaceLike | undefined {
  const workspaces = registry.list()
  const path = workspacePathForSession(workspaces, sessionId)
  return path === undefined ? undefined : workspaces.find((workspace) => workspace.path === path)
}

function safeError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback
  return /[A-Za-z]:[\\/]|\/(?:Users|home|tmp)\//.test(message) ? fallback : message
}

export function apply(ctx: Context): void {
  let config: DragFileConfig = { ...DEFAULT_CONFIG }
  const files = new FileTokenRegistry()
  const resolutions = new Map<string, Resolution>()

  const pruneResolutions = (): void => {
    const now = Date.now()
    for (const [id, entry] of resolutions) if (entry.expiresAt <= now) resolutions.delete(id)
    while (resolutions.size >= MAX_RESOLUTIONS) resolutions.delete(resolutions.keys().next().value as string)
  }
  const resolution = (id: unknown): Resolution | undefined => {
    if (typeof id !== 'string') return undefined
    const entry = resolutions.get(id)
    if (entry === undefined || entry.expiresAt <= Date.now()) { resolutions.delete(id); return undefined }
    entry.expiresAt = Date.now() + RESOLUTION_TTL_MS
    return entry
  }
  const found = async (path: string, sessionId: string, name: string): Promise<LocateResponse> => ({
    status: 'found', file: await files.register(path, sessionId, name),
  })
  const registerContained = async (path: string, root: string, sessionId: string, name: string): Promise<RegisteredFile> => {
    const canonical = await assertContainedFile(root, path)
    const file = await files.register(canonical, sessionId, name)
    try { await assertContainedFile(root, path) } catch (error) { files.revoke(file.id, sessionId); throw error }
    return file
  }

  try {
    installSettingsSection(ctx, SETTINGS_NAMESPACE, SETTINGS_SCHEMA, DEFAULT_CONFIG, {
      setSource: (current) => { config = { ...DEFAULT_CONFIG, ...current } },
      onChange: () => {},
    })
  } catch (error) {
    console.warn('[dsh-drag-file] settings section unavailable, using defaults:', error)
  }

  ctx.inject(['webServer', 'workspaceRegistry'], (webCtx) => {
    const registry = webCtx.workspaceRegistry as unknown as WorkspaceRegistryLike
    const register = (path: string, description: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): void => {
      webCtx.effect(() => webCtx.webServer.register({ kind: 'exact', path, handler }), description)
    }
    const hostService: DshDragFileHostService = createSideChatExportRegistrar({
      files,
      registry,
      config: () => config,
      exportRoot: sideChatExportRoot(),
    })
    webCtx.provide('dshDragFileHost', hostService)

    register(CONFIG_ROUTE, 'drag-file: config route', (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Use GET' } })
      sendJson(res, 200, { ok: true, value: config })
    })

    register(SETTINGS_ROUTE, 'drag-file: settings route', async (req, res) => {
      if (req.method === 'GET') return sendJson(res, 200, { ok: true, value: config })
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Use GET or POST' } })
      try {
        const next = SETTINGS_SCHEMA({ ...config, ...(await readJsonBody(req, 64 * 1024) as Partial<DragFileConfig>) }) as DragFileConfig
        assertSafeRelativeDirectory(next.dropDir)
        config = next
        try {
          const settings = ctx.get('settings') as { replace?: (ns: unknown, section: object) => Promise<void> } | undefined
          await settings?.replace?.(SETTINGS_NAMESPACE, { ...next })
        } catch (error) { console.warn('[dsh-drag-file] settings persist failed, keeping in-memory value:', error) }
        sendJson(res, 200, { ok: true, value: next })
      } catch (error) { sendJson(res, 400, { ok: false, error: { code: 'invalid-settings', message: safeError(error, 'Invalid settings') } }) }
    })

    register(RESOLVE_ROUTE, 'drag-file: resolve route', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { status: 'error', message: 'method not allowed' })
      try {
        const request = await readJsonBody(req, 64 * 1024) as LocateRequest
        let response: LocateResponse
        if (request.phase === 'metadata') {
          if (!validDroppedFile(request.file)) throw new Error('invalid dropped file metadata')
          const current = workspaceForSession(registry, request.sessionId)
          if (current === undefined) throw new Error('unknown session workspace')
          const candidates = await metadataCandidates(request.file, current.path, registry.list().map((item) => item.path))
          if (candidates.length === 0) response = { status: 'not-found' }
          else {
            pruneResolutions()
            const id = opaqueId()
            resolutions.set(id, { file: request.file, sessionId: request.sessionId, candidates: candidates.map((item) => item.path), choices: new Map(), stage: 'sample', expiresAt: Date.now() + RESOLUTION_TTL_MS })
            response = { status: 'sample-required', resolutionId: id }
          }
        } else if (request.phase === 'sample' || request.phase === 'full') {
          const entry = resolution(request.resolutionId)
          if (entry === undefined) throw new Error('invalid or expired resolution')
          if (entry.stage !== request.phase) throw new Error('invalid resolution phase')
          const matched = await matchingFileDigest(entry.candidates, request.digest, request.phase, entry.file)
          entry.candidates = matched
          const decision = resolutionDecision(request.phase, entry.file.size, matched.length)
          if (decision === 'not-found') { resolutions.delete(request.resolutionId); response = { status: 'not-found' } }
          else if (decision === 'found') { resolutions.delete(request.resolutionId); response = await found(matched[0], entry.sessionId, entry.file.name) }
          else if (decision === 'full-required') { entry.stage = 'full'; response = { status: 'full-required', resolutionId: request.resolutionId } }
          else if (decision === 'choose') {
            entry.choices.clear()
            const choices = matched.map((path, index) => {
              const id = opaqueId(); entry.choices.set(id, path)
              return { id, label: `候选文件 ${index + 1}` }
            })
            entry.stage = 'choose'
            response = { status: 'choose', resolutionId: request.resolutionId, choices }
          } else throw new Error('invalid resolution decision')
        } else if (request.phase === 'choose') {
          const entry = resolution(request.resolutionId)
          const path = entry?.choices.get(request.choiceId)
          if (entry === undefined || entry.stage !== 'choose' || path === undefined) throw new Error('invalid or expired choice')
          resolutions.delete(request.resolutionId)
          response = await found(path, entry.sessionId, entry.file.name)
        } else throw new Error('invalid resolve phase')
        sendJson(res, 200, response)
      } catch (error) { sendJson(res, 400, { status: 'error', message: safeError(error, 'File resolution failed') }) }
    })

    register(COPY_ROUTE, 'drag-file: copy route', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Use POST' } })
      try {
        const body = await readJsonBody(req) as { name?: unknown; dataBase64?: unknown; sessionId?: unknown }
        if (typeof body.dataBase64 !== 'string' || body.dataBase64.length === 0) throw new Error('Missing dataBase64')
        const bytes = Buffer.from(body.dataBase64, 'base64')
        if (bytes.length === 0 || bytes.length > MAX_COPY_BYTES) return sendJson(res, 413, { ok: false, error: { code: 'too-large', message: 'File is too large' } })
        const workspace = workspaceForSession(registry, body.sessionId)
        if (workspace === undefined) throw new Error('unknown session workspace')
        const copied = await copyBytesToDropDir(workspace.path, config.dropDir, body.name, bytes)
        const file = await registerContained(copied.path, workspace.path, String(body.sessionId), safeName(body.name))
        sendJson(res, 200, { ok: true, value: file })
      } catch (error) { sendJson(res, 400, { ok: false, error: { code: 'copy-failed', message: safeError(error, 'File copy failed') } }) }
    })

    register(PREVIEW_ROUTE, 'drag-file: preview route', async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Use GET or HEAD' } })
      const sessionId = querySessionId(req)
      const verified = workspaceForSession(registry, sessionId) === undefined ? undefined : await files.openVerified(queryId(req), sessionId)
      if (verified === undefined) return sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'Attachment is unavailable or expired' } })
      if (!['pdf', 'video', 'audio'].includes(verified.entry.previewKind)) {
        await verified.handle.close()
        return sendJson(res, 415, { ok: false, error: { code: 'not-previewable', message: 'This file type is not available for inline preview' } })
      }
      await streamRegisteredFile(res, verified.entry, req.headers.range, req.method === 'HEAD', verified.handle)
    })

    register(TEXT_PREVIEW_ROUTE, 'drag-file: text preview route', async (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Use GET' } })
      const sessionId = querySessionId(req)
      const verified = workspaceForSession(registry, sessionId) === undefined ? undefined : await files.openVerified(queryId(req), sessionId)
      if (verified === undefined) return sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'Attachment is unavailable or expired' } })
      const { entry, handle } = verified
      if (entry.previewKind !== 'text') { await handle.close(); return sendJson(res, 415, { ok: false, error: { code: 'not-previewable', message: 'This file is not a text preview' } }) }
      if (entry.size > MAX_TEXT_FILE_BYTES) { await handle.close(); return sendJson(res, 413, { ok: false, error: { code: 'too-large', message: 'This text file is too large to preview safely' } }) }
      try {
        const buffer = Buffer.alloc(Math.min(entry.size, TEXT_READ_BYTES))
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
        const body = buffer.subarray(0, bytesRead)
        res.writeHead(200, textPreviewHeaders(entry, body.length, entry.size > TEXT_READ_BYTES))
        res.end(body)
      } finally { await handle.close() }
    })

    register(OPEN_ROUTE, 'drag-file: system open route', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Use POST' } })
      try {
        const body = await readJsonBody(req, 16 * 1024) as { id?: unknown; sessionId?: unknown }
        const verified = workspaceForSession(registry, body.sessionId) === undefined ? undefined : await files.openVerified(body.id, body.sessionId)
        if (verified === undefined) return sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'Attachment is unavailable or expired' } })
        await verified.handle.close()
        await openWithSystem(verified.entry.path)
        sendJson(res, 200, { ok: true })
      } catch (error) { sendJson(res, 500, { ok: false, error: { code: 'open-failed', message: safeError(error, 'The system application could not open this file') } }) }
    })

    register(REVOKE_ROUTE, 'drag-file: revoke route', async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Use POST' } })
      try {
        const body = await readJsonBody(req, 16 * 1024) as { ids?: unknown; sessionId?: unknown }
        if (!Array.isArray(body.ids) || body.ids.length > 256) throw new Error('invalid token list')
        if (workspaceForSession(registry, body.sessionId) === undefined) throw new Error('unknown session workspace')
        for (const id of body.ids) files.revoke(id, body.sessionId)
        sendJson(res, 200, { ok: true })
      } catch (error) { sendJson(res, 400, { ok: false, error: { code: 'invalid-request', message: safeError(error, 'Invalid revoke request') } }) }
    })

    webCtx.effect(() => () => { files.clear(); resolutions.clear() }, 'drag-file: clear temporary registries')
  })
}

export default apply
