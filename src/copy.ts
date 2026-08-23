/**
 * Host-side copy of a dropped file into the workspace drop directory.
 * Adapted from loudMore/dsh-drop-to-path (MIT): same timestamped safe-name
 * scheme, but no extension allowlist — dsh-drag-file accepts any file type.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'

export const MAX_COPY_BYTES = 100 * 1024 * 1024

/** Strip path separators and control characters from an uploaded file name.
 *  Unicode (Chinese etc.), spaces and dots are preserved; only characters
 *  that are illegal in Windows file names are replaced. */
export function safeName(raw: unknown): string {
  const base = basename(String(raw ?? ''))
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .trim()
    .slice(0, 120)
  return base.length === 0 ? 'file' : base
}

/**
 * Write `bytes` into `<root>/<dropDir>/` under a timestamp-prefixed safe name
 * (collision-free even for repeated drags of the same file). Returns the
 * absolute path of the copy.
 */
export async function copyBytesToDropDir(
  root: string,
  dropDir: string,
  rawName: unknown,
  bytes: Buffer,
): Promise<{ path: string; filename: string }> {
  if (!isAbsolute(root)) throw new Error(`workspace root must be absolute, got "${root}"`)
  const safe = safeName(rawName)
  const dir = join(root, dropDir)
  await mkdir(dir, { recursive: true })
  const target = join(dir, `${Date.now()}-${safe}`)
  await writeFile(target, bytes)
  return { path: target, filename: basename(target) }
}

/**
 * Fallback workspace root when the client payload carries none: prefer the
 * durable workspace registry via DSH_HOME, then well-known harness homes.
 * Best-effort — the client normally sends the absolute session cwd.
 */
export async function fallbackWorkspaceRoot(registryList: (() => Array<{ path?: string }>) | undefined): Promise<string> {
  if (registryList) {
    const roots = registryList()
    const first = roots.find((root) => typeof root?.path === 'string' && isAbsolute(root.path))
    if (first) return first.path as string
  }
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  throw new Error(`no workspace available (checked registry and ${home})`)
}
