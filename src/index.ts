/**
 * dsh-drag-file — host half.
 *
 * Registers three exact HTTP routes on the DSH webServer:
 *   GET  /file-drop/config    → current plugin config { mode, dropDir }
 *   POST /file-drop/resolve   → locate the real filesystem path of a dropped
 *                               file (workspace → system dirs → index → walk)
 *   POST /file-drop/copy      → write a dropped file's bytes into
 *                               <workspace>/<dropDir>/ and return the copy path
 *
 * Configuration is exposed as a DSH settings section (namespace `drag-file`):
 *   mode    'resolve' | 'copy'  — resolve = keep the original path (no copy);
 *                                 copy = drop-into-workspace on release.
 *   dropDir relative folder under the workspace root; default `.drops`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { locate } from './locator.js'
import { copyBytesToDropDir, fallbackWorkspaceRoot, MAX_COPY_BYTES } from './copy.js'
import {
  CONFIG_ROUTE,
  COPY_ROUTE,
  RESOLVE_ROUTE,
  SETTINGS_ROUTE,
  type DragFileConfig,
  type LocateRequest,
  type LocateResponse,
} from './protocol.js'

export const SETTINGS_NAMESPACE = settingsNamespace('drag-file')

const SETTINGS_SCHEMA = z.object({
  mode: z.union([z.const('resolve'), z.const('copy')]).default('resolve'),
  dropDir: z.string().default('.drops'),
})

const DEFAULT_CONFIG: DragFileConfig = { mode: 'resolve', dropDir: '.drops' }

const MAX_BODY_BYTES = 140 * 1024 * 1024 // JSON body cap (~100MB file in base64)

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
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

export function apply(ctx: Context): void {
  let config: DragFileConfig = { ...DEFAULT_CONFIG }

  // Surface the settings section in the DSH settings UI; `setSource` keeps
  // `config` live without blocking on the settings service being ready.
  // Guarded: if the settings service is unavailable, the plugin must still
  // start with defaults rather than take the whole plugin tree down.
  try {
    installSettingsSection(ctx, SETTINGS_NAMESPACE, SETTINGS_SCHEMA, DEFAULT_CONFIG, {
      setSource: (current) => { config = { ...DEFAULT_CONFIG, ...current } },
      onChange: () => {},
    })
  } catch (error) {
    console.warn('[dsh-drag-file] settings section unavailable, using defaults:', error)
  }

  // NOTE: this harness's loader does not honor module-level `export const
  // inject` on function plugins ("cannot get property webServer without
  // inject"); the working pattern is the runtime injection form used by
  // dsh-drop-to-path: ctx.inject(['webServer'], (webCtx) => ...).
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: CONFIG_ROUTE,
      handler: async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Use GET' } })
          return
        }
        sendJson(res, 200, { ok: true, value: config })
      },
    }), 'drag-file: config route')

    // Fenced settings read/write for the plugin's own settings section.
    // Writes ride the settings seam in-process (the DSH settings RPC domain
    // does not serve third-party namespaces to configuration clients); when
    // the settings service is unavailable the write still updates the live
    // in-memory config for the current host session.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: SETTINGS_ROUTE,
      handler: async (req, res) => {
        if (req.method === 'GET') {
          sendJson(res, 200, { ok: true, value: config })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Use GET or POST' } })
          return
        }
        try {
          const body = await readJsonBody(req, 64 * 1024) as Partial<DragFileConfig>
          const next = { ...config, ...body }
          const validated = SETTINGS_SCHEMA(next) as DragFileConfig
          config = validated
          try {
            const settings = ctx.get('settings') as { replace?: (ns: unknown, section: object) => Promise<void> } | undefined
            await settings?.replace?.(SETTINGS_NAMESPACE, { ...validated })
          } catch (error) {
            console.warn('[dsh-drag-file] settings persist failed, keeping in-memory value:', error)
          }
          sendJson(res, 200, { ok: true, value: validated })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          sendJson(res, 400, { ok: false, error: { code: 'invalid-settings', message } })
        }
      },
    }), 'drag-file: settings route')

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: RESOLVE_ROUTE,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { status: 'error', message: 'method not allowed' })
          return
        }
        try {
          const request = await readJsonBody(req, 64 * 1024) as LocateRequest
          sendJson(res, 200, await locate(request) satisfies LocateResponse)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          sendJson(res, 400, { status: 'error', message })
        }
      },
    }), 'drag-file: resolve route')

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: COPY_ROUTE,
      handler: async (req, res) => {
        const respond = (value: unknown, status = 200): void => sendJson(res, status, value)
        try {
          if (req.method !== 'POST') {
            respond({ ok: false, error: { code: 'method-not-allowed', message: 'Use POST' } }, 405)
            return
          }
          let body: { name?: unknown; dataBase64?: unknown; workspace?: unknown }
          try {
            body = await readJsonBody(req) as { name?: unknown; dataBase64?: unknown; workspace?: unknown }
          } catch (error) {
            respond({ ok: false, error: { code: 'invalid-request', message: error instanceof Error ? error.message : String(error) } }, 400)
            return
          }
          const { name, dataBase64, workspace } = body
          if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
            respond({ ok: false, error: { code: 'invalid-request', message: 'Missing dataBase64' } }, 400)
            return
          }
          const bytes = Buffer.from(dataBase64, 'base64')
          if (bytes.length === 0 || bytes.length > MAX_COPY_BYTES) {
            respond({ ok: false, error: { code: 'too-large', message: `File exceeds ${Math.floor(MAX_COPY_BYTES / 1024 / 1024)}MB` } }, 413)
            return
          }
          // Trust the client-supplied active workspace only when it is an
          // absolute path; otherwise fall back to the durable registry so a
          // stale or tampered payload can never write outside a real root.
          const isAbs = typeof workspace === 'string' && workspace.length > 0 && isAbsolute(workspace)
          const root = isAbs ? workspace as string : await fallbackWorkspaceRoot(() => {
            const registry = ctx.get('workspaceRegistry') as { list?: () => Array<{ path?: string }> } | undefined
            return registry?.list ? registry.list() : []
          })
          const { path, filename } = await copyBytesToDropDir(root, config.dropDir, name, bytes)
          respond({ ok: true, value: { path, filename, bytes: bytes.length, dropDir: config.dropDir } })
        } catch (error) {
          respond({ ok: false, error: { code: 'copy-failed', message: error instanceof Error ? error.message : String(error) } }, 500)
        }
      },
    }), 'drag-file: copy route')
  })
}

export default apply
