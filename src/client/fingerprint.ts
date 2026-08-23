/**
 * Browser-side file fingerprinting (sample + full) over a File object.
 * Adapted from omdsh-dev/dsh-drag-and-drop (BSD-3-Clause).
 */
import type { DroppedFileMeta } from '../protocol.js'
import { SAMPLE_BYTES } from '../protocol.js'

export function droppedFileMeta(file: File): DroppedFileMeta {
  return { kind: 'file', name: file.name, size: file.size, lastModified: file.lastModified }
}

function sampleRanges(size: number): Array<{ start: number; length: number }> {
  if (!Number.isSafeInteger(size) || size < 0) throw new TypeError('size must be a non-negative safe integer')
  if (size <= SAMPLE_BYTES * 3) return [{ start: 0, length: size }]
  return [
    0,
    Math.max(0, Math.floor(size / 2) - Math.floor(SAMPLE_BYTES / 2)),
    size - SAMPLE_BYTES,
  ].map((start) => ({ start, length: Math.min(SAMPLE_BYTES, size - start) }))
}

/**
 * Must match the host-side fingerprint exactly (src/fingerprint.ts): one
 * SHA-256 over an 8-byte big-endian size header followed by all sampled
 * ranges, in order.
 */
async function hashFromFile(file: File, size: number, ranges: readonly Array<{ start: number; length: number }>): Promise<string> {
  const parts: Uint8Array[] = []
  for (const range of ranges) {
    parts.push(new Uint8Array(await file.slice(range.start, range.start + range.length).arrayBuffer()))
  }
  const header = new Uint8Array(8)
  new DataView(header.buffer).setBigUint64(0, BigInt(size), false)
  const total = header.length + parts.reduce((sum, part) => sum + part.length, 0)
  const joined = new Uint8Array(total)
  joined.set(header, 0)
  let offset = header.length
  for (const part of parts) {
    joined.set(part, offset)
    offset += part.length
  }
  const digest = await crypto.subtle.digest('SHA-256', joined)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sampleFingerprint(file: File): Promise<string> {
  return hashFromFile(file, file.size, sampleRanges(file.size))
}

export async function fullFingerprint(file: File): Promise<string> {
  return hashFromFile(file, file.size, [{ start: 0, length: file.size }])
}
