/**
 * Shared wire protocol for dsh-drag-file.
 * Adapted from omdsh-dev/dsh-drag-and-drop (BSD-3-Clause), files-only subset.
 */

export const FILE_DROP_ROUTE = '/file-drop'
export const RESOLVE_ROUTE = `${FILE_DROP_ROUTE}/resolve`
export const COPY_ROUTE = `${FILE_DROP_ROUTE}/copy`
export const CONFIG_ROUTE = `${FILE_DROP_ROUTE}/config`
export const SETTINGS_ROUTE = `${FILE_DROP_ROUTE}/settings`

export const SAMPLE_BYTES = 64 * 1024
export const SMALL_FILE_BYTES = 8 * 1024 * 1024

export interface DroppedFileMeta {
  readonly kind: 'file'
  readonly name: string
  readonly size: number
  readonly lastModified: number
}

export interface LocateRequest {
  readonly phase: 'metadata' | 'sample' | 'full'
  readonly file: DroppedFileMeta
  readonly digest?: string
  readonly candidates?: readonly string[]
  readonly workspacePaths?: readonly string[]
  readonly currentWorkspacePath?: string
}

export type LocateResponse =
  | { readonly status: 'found'; readonly path: string }
  | { readonly status: 'sample-required'; readonly candidates: readonly string[] }
  | { readonly status: 'full-required'; readonly candidates: readonly string[] }
  | { readonly status: 'choose'; readonly candidates: readonly string[] }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly message: string }

/** Plugin configuration (also surfaced as a DSH settings section). */
export interface DragFileConfig {
  readonly mode: 'resolve' | 'copy'
  readonly dropDir: string
}
