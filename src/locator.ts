/**
 * Host-side path locator for dropped files.
 * Adapted from omdsh-dev/dsh-drag-and-drop (BSD-3-Clause), files-only subset:
 *   tier 1: current workspace → other registered workspaces → system dirs
 *   tier 2: shallow scan (depth 1-3, SHALLOW_MAX_DIRS cap)
 *   tier 3: system index (Everything CLI / Spotlight / plocate, optional)
 *   tier 4: bounded recursive walk as fallback
 * Candidates are deduped by path, validated by name+size, and ranked by
 * |mtime - lastModified|. Ambiguity is resolved by sample/full content
 * fingerprinting; ties fall through to the client chooser.
 */
import { homedir } from 'node:os'
import { basename, join, normalize, resolve, sep } from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { fullFingerprint, sampleFingerprint } from './fingerprint.js'
import { broadSearchRoots, indexedSearch } from './platform-search.js'
import type { DroppedFileMeta, LocateRequest, LocateResponse } from './protocol.js'
import { SMALL_FILE_BYTES } from './protocol.js'

const MAX_CANDIDATES = 100
const MAX_WALK_ENTRIES = 20_000
const WALK_DEPTH = 12
/** Per-root cap on direct subdirectories expanded by the depth-3 fast path. */
const SHALLOW_MAX_DIRS = 4096

interface Candidate {
  readonly path: string
  readonly mtimeMs: number
}

async function directCandidate(root: string, name: string): Promise<string | undefined> {
  const path = join(root, name)
  try {
    const info = await stat(path)
    return info.isFile() ? path : undefined
  } catch { return undefined }
}

async function walkByName(root: string, name: string, depth = WALK_DEPTH): Promise<string[]> {
  const found: string[] = []
  let visited = 0
  const visit = async (directory: string, remaining: number): Promise<void> => {
    if (remaining < 0 || found.length >= MAX_CANDIDATES || visited >= MAX_WALK_ENTRIES) return
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (++visited >= MAX_WALK_ENTRIES || found.length >= MAX_CANDIDATES) break
      const path = join(directory, entry.name)
      if (entry.name === name && entry.isFile()) found.push(path)
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(path, remaining - 1)
    }
  }
  await visit(root, depth)
  return found
}

async function validateCandidates(item: DroppedFileMeta, paths: readonly string[]): Promise<Candidate[]> {
  const candidates: Candidate[] = []
  for (const path of [...new Set(paths)].slice(0, MAX_CANDIDATES)) {
    try {
      const info = await stat(path)
      if (info.isFile() && info.size === item.size && basename(path) === item.name) {
        candidates.push({ path: normalize(path), mtimeMs: info.mtimeMs })
      }
    } catch { /* Candidate disappeared between lookup and validation. */ }
  }
  return candidates.sort(
    (a, b) => Math.abs(a.mtimeMs - item.lastModified) - Math.abs(b.mtimeMs - item.lastModified) || a.path.localeCompare(b.path),
  )
}

/**
 * Fast path: probe each root's shallow tree (depths 1-3). Depths 1-2 are blind
 * stats; only depth 3 requires expanding the direct subdirectories. Resolves
 * the overwhelming majority of real drops without a full walk; the bounded
 * recursive search below remains the fallback for deeper files.
 */
async function shallowCandidates(item: DroppedFileMeta, roots: readonly string[]): Promise<Candidate[]> {
  const paths: string[] = []
  for (const root of roots) {
    const direct = await directCandidate(root, item.name)
    if (direct !== undefined) paths.push(direct)
    let entries
    try { entries = await readdir(root, { withFileTypes: true }) } catch { continue }
    let expanded = 0
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      if (expanded >= SHALLOW_MAX_DIRS) break
      expanded += 1
      const directory = join(root, entry.name)
      const nested = await directCandidate(directory, item.name)
      if (nested !== undefined) paths.push(nested)
      let grandchildren
      try { grandchildren = await readdir(directory, { withFileTypes: true }) } catch { continue }
      for (const grandchild of grandchildren) {
        if (!grandchild.isDirectory() || grandchild.isSymbolicLink()) continue
        const deep = await directCandidate(join(directory, grandchild.name), item.name)
        if (deep !== undefined) paths.push(deep)
      }
    }
  }
  return validateCandidates(item, paths)
}

async function recursiveCandidates(item: DroppedFileMeta, roots: readonly string[]): Promise<Candidate[]> {
  const paths: string[] = []
  for (const root of roots) paths.push(...await walkByName(root, item.name))
  return validateCandidates(item, paths)
}

function pathsInside(paths: readonly string[], roots: readonly string[]): string[] {
  const canonicalRoots = roots.map((root) => resolve(root))
  return paths.filter((path) => {
    const candidate = resolve(path)
    return canonicalRoots.some((root) => candidate === root || candidate.startsWith(`${root}${sep}`))
  })
}

async function metadataCandidates(item: DroppedFileMeta, request: LocateRequest): Promise<Candidate[]> {
  const current = request.currentWorkspacePath
  const workspaceRoots = [...new Set(request.workspacePaths ?? [])].filter((root) => typeof root === 'string' && root !== '')
  const otherWorkspaces = workspaceRoots.filter((root) => root !== current)
  const commonRoots = [join(homedir(), 'Desktop'), join(homedir(), 'Documents'), join(homedir(), 'Downloads')]

  const rootGroups = [current === undefined ? [] : [current], otherWorkspaces, commonRoots]
  const indexedPaths = await indexedSearch(item.name)
  for (const roots of rootGroups) {
    const shallow = await shallowCandidates(item, roots)
    if (shallow.length > 0) return shallow
    const indexed = await validateCandidates(item, pathsInside(indexedPaths, roots))
    if (indexed.length > 0) return indexed
    const recursive = await recursiveCandidates(item, roots)
    if (recursive.length > 0) return recursive
  }
  const globalIndexed = await validateCandidates(item, indexedPaths)
  if (globalIndexed.length > 0) return globalIndexed
  return recursiveCandidates(item, await broadSearchRoots())
}

async function matchingFileDigest(candidates: readonly string[], digest: string, phase: 'sample' | 'full', file: DroppedFileMeta): Promise<string[]> {
  const matched: string[] = []
  for (const path of candidates.slice(0, MAX_CANDIDATES)) {
    try {
      const actual = phase === 'sample' ? await sampleFingerprint(path, file.size) : await fullFingerprint(path)
      if (actual === digest) matched.push(path)
    } catch { /* Unreadable candidates are not matches. */ }
  }
  return matched
}

export async function locate(request: LocateRequest): Promise<LocateResponse> {
  const file = request.file
  if (file.name === '') return { status: 'error', message: 'invalid dropped file metadata' }
  if (!Number.isSafeInteger(file.size) || file.size < 0) return { status: 'error', message: 'invalid dropped-file metadata' }

  if (request.phase === 'metadata') {
    const candidates = await metadataCandidates(file, request)
    if (candidates.length === 0) return { status: 'not-found' }
    if (candidates.length === 1) return { status: 'found', path: candidates[0].path }
    return { status: 'sample-required', candidates: candidates.map((candidate) => candidate.path) }
  }
  if ((request.phase !== 'sample' && request.phase !== 'full') || request.digest === undefined || request.candidates === undefined) {
    return { status: 'error', message: 'digest phase requires candidates and digest' }
  }
  const matched = await matchingFileDigest(request.candidates, request.digest, request.phase, file)
  if (matched.length === 0) return { status: 'not-found' }
  if (matched.length === 1) return { status: 'found', path: matched[0] }
  if (request.phase === 'sample' && file.size <= SMALL_FILE_BYTES) return { status: 'choose', candidates: matched }
  if (request.phase === 'sample') return { status: 'full-required', candidates: matched }
  return { status: 'choose', candidates: matched }
}
