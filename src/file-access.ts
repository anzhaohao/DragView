import { createReadStream } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, stat, type FileHandle } from 'node:fs/promises'
import { spawn, type SpawnOptions } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { ServerResponse } from 'node:http'
import type { PreviewKind, RegisteredFile } from './protocol.js'
import { SAMPLE_BYTES } from './protocol.js'

export const FILE_TOKEN_TTL_MS = 4 * 60 * 60 * 1000
export const RESOLUTION_TTL_MS = 5 * 60 * 1000
export const MAX_FILE_TOKENS = 256
export const MAX_RESOLUTIONS = 64

export type ResolutionDecision = 'not-found' | 'sample-required' | 'full-required' | 'found' | 'choose'

export function resolutionDecision(
  phase: 'metadata' | 'sample' | 'full',
  fileSize: number,
  candidateCount: number,
): ResolutionDecision {
  if (candidateCount <= 0) return 'not-found'
  if (phase === 'metadata') return 'sample-required'
  if (phase === 'sample' && fileSize > SAMPLE_BYTES * 3) return 'full-required'
  return candidateCount === 1 ? 'found' : 'choose'
}

export interface FileIdentity {
  readonly path: string
  readonly realPath: string
  readonly sessionId: string
  readonly name: string
  readonly size: number
  readonly mtimeMs: number
  readonly dev: number
  readonly ino: number
  readonly mediaType: string
  readonly typeLabel: string
  readonly previewKind: PreviewKind
  expiresAt: number
}

export interface VerifiedFileHandle {
  readonly entry: FileIdentity
  readonly handle: FileHandle
}

interface TypeInfo {
  readonly mediaType: string
  readonly typeLabel: string
  readonly previewKind: PreviewKind
}

const TYPE_MAP: Readonly<Record<string, TypeInfo>> = Object.freeze({
  pdf: { mediaType: 'application/pdf', typeLabel: 'PDF', previewKind: 'pdf' },
  txt: { mediaType: 'text/plain', typeLabel: '文本', previewKind: 'text' },
  md: { mediaType: 'text/markdown', typeLabel: 'Markdown', previewKind: 'text' },
  markdown: { mediaType: 'text/markdown', typeLabel: 'Markdown', previewKind: 'text' },
  json: { mediaType: 'application/json', typeLabel: 'JSON', previewKind: 'text' },
  csv: { mediaType: 'text/csv', typeLabel: 'CSV', previewKind: 'text' },
  log: { mediaType: 'text/plain', typeLabel: '日志', previewKind: 'text' },
  yaml: { mediaType: 'text/yaml', typeLabel: 'YAML', previewKind: 'text' },
  yml: { mediaType: 'text/yaml', typeLabel: 'YAML', previewKind: 'text' },
  xml: { mediaType: 'application/xml', typeLabel: 'XML', previewKind: 'text' },
  html: { mediaType: 'text/html', typeLabel: 'HTML', previewKind: 'text' },
  css: { mediaType: 'text/css', typeLabel: 'CSS', previewKind: 'text' },
  js: { mediaType: 'text/javascript', typeLabel: 'JavaScript', previewKind: 'text' },
  jsx: { mediaType: 'text/plain', typeLabel: 'JSX', previewKind: 'text' },
  ts: { mediaType: 'text/plain', typeLabel: 'TypeScript', previewKind: 'text' },
  tsx: { mediaType: 'text/plain', typeLabel: 'TSX', previewKind: 'text' },
  py: { mediaType: 'text/x-python', typeLabel: 'Python', previewKind: 'text' },
  go: { mediaType: 'text/plain', typeLabel: 'Go', previewKind: 'text' },
  rs: { mediaType: 'text/plain', typeLabel: 'Rust', previewKind: 'text' },
  java: { mediaType: 'text/plain', typeLabel: 'Java', previewKind: 'text' },
  c: { mediaType: 'text/plain', typeLabel: 'C', previewKind: 'text' },
  cpp: { mediaType: 'text/plain', typeLabel: 'C++', previewKind: 'text' },
  h: { mediaType: 'text/plain', typeLabel: '头文件', previewKind: 'text' },
  sh: { mediaType: 'text/plain', typeLabel: 'Shell', previewKind: 'text' },
  ps1: { mediaType: 'text/plain', typeLabel: 'PowerShell', previewKind: 'text' },
  sql: { mediaType: 'text/plain', typeLabel: 'SQL', previewKind: 'text' },
  toml: { mediaType: 'text/plain', typeLabel: 'TOML', previewKind: 'text' },
  mp4: { mediaType: 'video/mp4', typeLabel: 'MP4 视频', previewKind: 'video' },
  webm: { mediaType: 'video/webm', typeLabel: 'WebM 视频', previewKind: 'video' },
  mov: { mediaType: 'video/quicktime', typeLabel: 'MOV 视频', previewKind: 'video' },
  m4v: { mediaType: 'video/x-m4v', typeLabel: 'M4V 视频', previewKind: 'video' },
  mp3: { mediaType: 'audio/mpeg', typeLabel: 'MP3 音频', previewKind: 'audio' },
  wav: { mediaType: 'audio/wav', typeLabel: 'WAV 音频', previewKind: 'audio' },
  flac: { mediaType: 'audio/flac', typeLabel: 'FLAC 音频', previewKind: 'audio' },
  m4a: { mediaType: 'audio/mp4', typeLabel: 'M4A 音频', previewKind: 'audio' },
  ogg: { mediaType: 'audio/ogg', typeLabel: 'OGG 音频', previewKind: 'audio' },
  doc: { mediaType: 'application/msword', typeLabel: 'Word 文档', previewKind: 'system' },
  docx: { mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', typeLabel: 'Word 文档', previewKind: 'system' },
  xls: { mediaType: 'application/vnd.ms-excel', typeLabel: 'Excel 表格', previewKind: 'system' },
  xlsx: { mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', typeLabel: 'Excel 表格', previewKind: 'system' },
  ppt: { mediaType: 'application/vnd.ms-powerpoint', typeLabel: 'PowerPoint 演示文稿', previewKind: 'system' },
  pptx: { mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', typeLabel: 'PowerPoint 演示文稿', previewKind: 'system' },
  zip: { mediaType: 'application/zip', typeLabel: 'ZIP 压缩包', previewKind: 'system' },
  rar: { mediaType: 'application/vnd.rar', typeLabel: 'RAR 压缩包', previewKind: 'system' },
  '7z': { mediaType: 'application/x-7z-compressed', typeLabel: '7Z 压缩包', previewKind: 'system' },
  tar: { mediaType: 'application/x-tar', typeLabel: 'TAR 压缩包', previewKind: 'system' },
  gz: { mediaType: 'application/gzip', typeLabel: 'GZip 压缩包', previewKind: 'system' },
})

export function classifyFile(name: string): TypeInfo {
  const extension = extname(name).slice(1).toLowerCase()
  return TYPE_MAP[extension] ?? {
    mediaType: 'application/octet-stream',
    typeLabel: extension ? `${extension.toUpperCase()} 文件` : '文件',
    previewKind: 'system',
  }
}

function opaqueId(): string {
  return randomBytes(24).toString('base64url')
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

export function assertSafeRelativeDirectory(value: string): readonly string[] {
  if (typeof value !== 'string' || value.trim() === '' || isAbsolute(value)) {
    throw new Error('dropDir must be a non-empty relative directory')
  }
  const segments = value.replaceAll('\\', '/').split('/').filter(Boolean)
  if (segments.length === 0 || segments.some((part) => part === '.' || part === '..' || /[\x00-\x1f:*?"<>|]/.test(part))) {
    throw new Error('dropDir contains an unsafe path segment')
  }
  return segments
}

export function workspacePathForSession(
  workspaces: readonly { readonly path: string; readonly sessionIds?: readonly string[] }[],
  sessionId: unknown,
): string | undefined {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
  return workspaces.find((workspace) => workspace.sessionIds?.includes(sessionId))?.path
}

export async function ensureContainedDirectory(rootInput: string, dropDir: string): Promise<{ root: string; directory: string }> {
  const rootInfo = await lstat(resolve(rootInput))
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error('workspace root cannot be a symbolic link or junction')
  const root = await realpath(rootInput)
  if (!(await stat(root)).isDirectory()) throw new Error('workspace is not a directory')
  let current = root
  for (const segment of assertSafeRelativeDirectory(dropDir)) {
    const next = resolve(current, segment)
    if (!inside(root, next)) throw new Error('dropDir escapes the workspace')
    try {
      const info = await lstat(next)
      if (info.isSymbolicLink()) throw new Error('dropDir cannot traverse a symbolic link or junction')
      if (!info.isDirectory()) throw new Error('dropDir collides with a non-directory')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await mkdir(next)
    }
    current = await realpath(next)
    if (!inside(root, current)) throw new Error('dropDir resolves outside the workspace')
  }
  return { root, directory: current }
}

export async function assertContainedFile(rootInput: string, targetInput: string): Promise<string> {
  const rootInfo = await lstat(resolve(rootInput))
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error('trusted root cannot be a symbolic link or junction')
  const root = await realpath(rootInput)
  const target = await realpath(targetInput)
  if (!inside(root, target)) throw new Error('written attachment resolves outside the workspace')
  const requestedRoot = resolve(rootInput)
  const requestedTarget = resolve(targetInput)
  const lexicalInside = inside(requestedRoot, requestedTarget)
  const sameCanonicalTarget = process.platform === 'win32'
    ? requestedTarget.toLowerCase() === target.toLowerCase()
    : requestedTarget === target
  if (!lexicalInside && !sameCanonicalTarget) throw new Error('attachment path escapes its trusted root')
  const lexicalRoot = lexicalInside ? requestedRoot : root
  const lexicalTarget = lexicalInside ? requestedTarget : target
  let current = lexicalRoot
  const segments = relative(lexicalRoot, lexicalTarget).split(sep).filter(Boolean)
  for (const segment of segments) {
    current = resolve(current, segment)
    const info = await lstat(current)
    if (info.isSymbolicLink()) throw new Error('attachment path cannot traverse a symbolic link or junction')
  }
  if (!(await stat(target)).isFile()) throw new Error('written attachment is not a file')
  return target
}

/** Read a trusted-root file while detecting path swaps and post-open mutation. */
export async function readContainedFile(rootInput: string, targetInput: string, maxBytes: number): Promise<Buffer> {
  const canonical = await assertContainedFile(rootInput, targetInput)
  const before = await stat(canonical)
  if (before.size > maxBytes) throw new Error('attachment is too large')
  const bytes = await readFile(canonical)
  const afterCanonical = await assertContainedFile(rootInput, targetInput)
  const after = await stat(afterCanonical)
  if (afterCanonical !== canonical || after.size !== before.size || after.mtimeMs !== before.mtimeMs
    || after.dev !== before.dev || after.ino !== before.ino || bytes.length !== before.size) {
    throw new Error('attachment changed while it was being read')
  }
  return bytes
}

export class FileTokenRegistry {
  private readonly entries = new Map<string, FileIdentity>()

  constructor(private readonly now: () => number = Date.now) {}

  async register(filePath: string, sessionId: string, displayName?: string): Promise<RegisteredFile> {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('registered attachment has no session')
    const canonical = await realpath(filePath)
    const info = await stat(canonical)
    if (!info.isFile()) throw new Error('registered attachment is not a file')
    const name = basename(displayName || canonical)
    const kind = classifyFile(name)
    this.prune()
    while (this.entries.size >= MAX_FILE_TOKENS) this.entries.delete(this.entries.keys().next().value as string)
    const id = opaqueId()
    this.entries.set(id, {
      path: canonical,
      realPath: canonical,
      sessionId,
      name,
      size: info.size,
      mtimeMs: info.mtimeMs,
      dev: info.dev,
      ino: info.ino,
      ...kind,
      expiresAt: this.now() + FILE_TOKEN_TTL_MS,
    })
    return { id, ref: canonical, sessionId, name, size: info.size, ...kind }
  }

  async access(id: unknown, sessionId: unknown): Promise<FileIdentity | undefined> {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(id)
      || typeof sessionId !== 'string' || sessionId.length === 0) return undefined
    const entry = this.entries.get(id)
    if (entry === undefined || entry.sessionId !== sessionId) return undefined
    if (entry.expiresAt <= this.now()) {
      if (entry !== undefined) this.entries.delete(id)
      return undefined
    }
    try {
      const canonical = await realpath(entry.path)
      const info = await stat(canonical)
      if (!info.isFile() || canonical !== entry.realPath || info.size !== entry.size
        || info.mtimeMs !== entry.mtimeMs || info.dev !== entry.dev || info.ino !== entry.ino) {
        this.entries.delete(id)
        return undefined
      }
      entry.expiresAt = this.now() + FILE_TOKEN_TTL_MS
      return entry
    } catch {
      this.entries.delete(id)
      return undefined
    }
  }

  async openVerified(id: unknown, sessionId: unknown): Promise<VerifiedFileHandle | undefined> {
    const entry = await this.access(id, sessionId)
    if (entry === undefined) return undefined
    let handle: FileHandle | undefined
    try {
      handle = await open(entry.path, 'r')
      const info = await handle.stat()
      if (!info.isFile() || info.size !== entry.size || info.mtimeMs !== entry.mtimeMs
        || info.dev !== entry.dev || info.ino !== entry.ino) {
        this.entries.delete(String(id))
        await handle.close()
        return undefined
      }
      return { entry, handle }
    } catch {
      if (handle !== undefined) await handle.close().catch(() => undefined)
      this.entries.delete(String(id))
      return undefined
    }
  }

  revoke(id: unknown, sessionId: unknown): boolean {
    const entry = typeof id === 'string' ? this.entries.get(id) : undefined
    return entry !== undefined && entry.sessionId === sessionId && this.entries.delete(id as string)
  }

  clear(): void { this.entries.clear() }

  private prune(): void {
    const now = this.now()
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(id)
  }
}

export interface ByteRange { readonly start: number; readonly end: number }

export function parseSingleRange(header: string | undefined, size: number): ByteRange | undefined | null {
  if (header === undefined) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || size <= 0) return null
  const [, startText, endText] = match
  let start: number
  let end: number
  if (startText === '') {
    const suffix = Number(endText)
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startText)
    end = endText === '' ? size - 1 : Number(endText)
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null
    end = Math.min(end, size - 1)
  }
  return { start, end }
}

export function inlineDisposition(name: string): string {
  const fallback = basename(name).replace(/[^\x20-\x7e]|["\\]/g, '_') || 'file'
  const encoded = encodeURIComponent(basename(name)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

export function textPreviewHeaders(entry: { readonly name: string }, contentLength: number, truncated: boolean): Record<string, string | number> {
  return {
    'content-type': 'text/plain; charset=utf-8',
    'content-disposition': inlineDisposition(entry.name),
    'content-length': contentLength,
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'; base-uri 'none'",
    'x-dsh-drag-file-truncated': truncated ? '1' : '0',
  }
}

export async function streamRegisteredFile(res: ServerResponse, entry: FileIdentity, rangeHeader?: string, head = false, handle?: FileHandle): Promise<void> {
  const range = parseSingleRange(rangeHeader, entry.size)
  const headers: Record<string, string | number> = {
    'content-type': entry.mediaType,
    'content-disposition': inlineDisposition(entry.name),
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
  }
  const pipeStream = async (start?: number, end?: number): Promise<void> => {
    let stream: ReturnType<typeof createReadStream> | undefined
    try {
      const options = start === undefined ? { autoClose: true } : { start, end, autoClose: true }
      stream = handle?.createReadStream(options) ?? createReadStream(entry.path, options)
      const destroyStream = (): void => stream?.destroy()
      res.once('close', destroyStream)
      stream.once('close', () => res.off('close', destroyStream))
      stream.on('error', () => res.destroy()).pipe(res)
    } catch (error) {
      if (stream !== undefined) stream.destroy()
      else await handle?.close().catch(() => undefined)
      throw error
    }
  }
  if (range === null) {
    res.writeHead(416, { ...headers, 'content-range': `bytes */${entry.size}` })
    try { await handle?.close() } finally { res.end() }
    return
  }
  if (range === undefined) {
    res.writeHead(200, { ...headers, 'content-length': entry.size })
    if (head) {
      try { await handle?.close() } finally { res.end() }
      return
    }
    await pipeStream()
    return
  }
  const length = range.end - range.start + 1
  res.writeHead(206, { ...headers, 'content-length': length, 'content-range': `bytes ${range.start}-${range.end}/${entry.size}` })
  if (head) {
    try { await handle?.close() } finally { res.end() }
    return
  }
  await pipeStream(range.start, range.end)
}

export interface OpenCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly options: SpawnOptions
}

export function systemOpenCommand(filePath: string, platform = process.platform): OpenCommand {
  if (platform === 'win32') return { command: 'explorer.exe', args: [filePath], options: { shell: false, detached: true, stdio: 'ignore', windowsHide: true } }
  if (platform === 'darwin') return { command: 'open', args: [filePath], options: { shell: false, detached: true, stdio: 'ignore' } }
  return { command: 'xdg-open', args: [filePath], options: { shell: false, detached: true, stdio: 'ignore' } }
}

export function openWithSystem(filePath: string): Promise<void> {
  const spec = systemOpenCommand(filePath)
  return new Promise((resolvePromise, reject) => {
    const child = spawn(spec.command, [...spec.args], spec.options)
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolvePromise() })
  })
}

export async function writeUniqueFile(directory: string, rawName: unknown, bytes: Uint8Array): Promise<string> {
  const stem = basename(String(rawName ?? '')).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 120) || 'file'
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const target = resolve(directory, `${Date.now()}-${randomBytes(4).toString('hex')}-${stem}`)
    const handle = await open(target, 'wx').catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return undefined
      throw error
    })
    if (handle === undefined) continue
    try { await handle.writeFile(bytes) } finally { await handle.close() }
    return target
  }
  throw new Error('could not allocate a unique attachment name')
}
