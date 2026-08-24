/**
 * Browser-side locator client: drives the host locate RPC through its
 * metadata → sample → full phases.
 * Adapted from omdsh-dev/dsh-drag-and-drop (BSD-3-Clause).
 */
import { RESOLVE_ROUTE, type LocateRequest, type LocateResponse } from '../protocol.js'
import { droppedFileMeta, fullFingerprint, sampleFingerprint } from './fingerprint.js'

async function request(body: LocateRequest): Promise<LocateResponse> {
  const response = await fetch(RESOLVE_ROUTE, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const value = await response.json() as LocateResponse
  return response.ok ? value : { status: 'error', message: value.status === 'error' ? value.message : `HTTP ${response.status}` }
}

export async function locateDroppedFile(file: File, sessionId: string): Promise<LocateResponse> {
  const meta = droppedFileMeta(file)
  let result = await request({ phase: 'metadata', file: meta, sessionId })
  if (result.status !== 'sample-required') return result
  result = await request({ phase: 'sample', resolutionId: result.resolutionId, digest: await sampleFingerprint(file) })
  if (result.status !== 'full-required') return result
  return request({ phase: 'full', resolutionId: result.resolutionId, digest: await fullFingerprint(file) })
}

export function chooseLocatedFile(resolutionId: string, choiceId: string): Promise<LocateResponse> {
  return request({ phase: 'choose', resolutionId, choiceId })
}
