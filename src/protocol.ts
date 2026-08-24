/** Shared wire protocol for dsh-drag-file. */

export const FILE_DROP_ROUTE = '/file-drop'
export const RESOLVE_ROUTE = `${FILE_DROP_ROUTE}/resolve`
export const COPY_ROUTE = `${FILE_DROP_ROUTE}/copy`
export const CONFIG_ROUTE = `${FILE_DROP_ROUTE}/config`
export const SETTINGS_ROUTE = `${FILE_DROP_ROUTE}/settings`
export const PREVIEW_ROUTE = `${FILE_DROP_ROUTE}/preview`
export const TEXT_PREVIEW_ROUTE = `${FILE_DROP_ROUTE}/text-preview`
export const OPEN_ROUTE = `${FILE_DROP_ROUTE}/open`
export const REVOKE_ROUTE = `${FILE_DROP_ROUTE}/revoke`

export const SAMPLE_BYTES = 64 * 1024
export const SMALL_FILE_BYTES = 8 * 1024 * 1024
export const TEXT_READ_BYTES = 1024 * 1024
export const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024

export type PreviewKind = 'pdf' | 'text' | 'video' | 'audio' | 'system'

export interface DroppedFileMeta {
  readonly kind: 'file'
  readonly name: string
  readonly size: number
  readonly lastModified: number
}

export interface RegisteredFile {
  readonly id: string
  /** Sending metadata only. Host file access is authorized exclusively by id + sessionId. */
  readonly ref: string
  readonly sessionId: string
  readonly name: string
  readonly size: number
  readonly mediaType: string
  readonly typeLabel: string
  readonly previewKind: PreviewKind
}

export type LocateRequest =
  | { readonly phase: 'metadata'; readonly file: DroppedFileMeta; readonly sessionId: string }
  | { readonly phase: 'sample' | 'full'; readonly resolutionId: string; readonly digest: string }
  | { readonly phase: 'choose'; readonly resolutionId: string; readonly choiceId: string }

export interface LocateChoice {
  readonly id: string
  readonly label: string
}

export type LocateResponse =
  | { readonly status: 'found'; readonly file: RegisteredFile }
  | { readonly status: 'sample-required'; readonly resolutionId: string }
  | { readonly status: 'full-required'; readonly resolutionId: string }
  | { readonly status: 'choose'; readonly resolutionId: string; readonly choices: readonly LocateChoice[] }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly message: string }

/** Plugin configuration (also surfaced as a DSH settings section). */
export interface DragFileConfig {
  readonly mode: 'resolve' | 'copy'
  readonly dropDir: string
}
