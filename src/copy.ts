/**
 * Host-side copy of a dropped file into the workspace drop directory.
 * Adapted from loudMore/dsh-drop-to-path (MIT): same timestamped safe-name
 * scheme, but no extension allowlist — dsh-drag-file accepts any file type.
 */
import { basename, isAbsolute } from 'node:path'
import { assertContainedFile, ensureContainedDirectory, writeUniqueFile } from './file-access.js'

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
  const { root: canonicalRoot, directory } = await ensureContainedDirectory(root, dropDir)
  const target = await writeUniqueFile(directory, safe, bytes)
  const canonicalTarget = await assertContainedFile(canonicalRoot, target)
  return { path: canonicalTarget, filename: basename(canonicalTarget) }
}
