import { copyBytesToDropDir, safeName } from './copy.js'
import { assertContainedFile, FileTokenRegistry, readContainedFile, workspacePathForSession } from './file-access.js'
import type { DragFileConfig, RegisteredFile } from './protocol.js'

export const MAX_SIDE_CHAT_EXPORT_BYTES = 4 * 1024 * 1024

export interface SideChatExportRegistration {
  readonly parentSessionId: string
  readonly sourcePath: string
  readonly name: string
  readonly mediaType: 'text/markdown'
}

export interface DshDragFileHostService {
  registerSideChatExport(input: SideChatExportRegistration): Promise<RegisteredFile>
}

interface WorkspaceLike {
  readonly path: string
  readonly sessionIds?: readonly string[]
}

interface WorkspaceRegistryLike {
  list(): WorkspaceLike[]
}

export function createSideChatExportRegistrar(input: {
  readonly files: FileTokenRegistry
  readonly registry: WorkspaceRegistryLike
  readonly config: () => DragFileConfig
  readonly exportRoot: string
}): DshDragFileHostService {
  const registerContained = async (filePath: string, root: string, sessionId: string, name: string): Promise<RegisteredFile> => {
    const canonical = await assertContainedFile(root, filePath)
    const file = await input.files.register(canonical, sessionId, name)
    try { await assertContainedFile(root, filePath) } catch (error) {
      input.files.revoke(file.id, sessionId)
      throw error
    }
    return file
  }

  return {
    registerSideChatExport: async (request) => {
      if (request.mediaType !== 'text/markdown' || typeof request.name !== 'string'
        || !request.name.toLowerCase().endsWith('.md')) throw new Error('invalid Side Chat Markdown export')
      const workspaces = input.registry.list()
      const workspacePath = workspacePathForSession(workspaces, request.parentSessionId)
      if (workspacePath === undefined) throw new Error('unknown parent session workspace')
      await assertContainedFile(input.exportRoot, request.sourcePath)
      if (input.config().mode === 'resolve') {
        return registerContained(request.sourcePath, input.exportRoot, request.parentSessionId, safeName(request.name))
      }
      const bytes = await readContainedFile(input.exportRoot, request.sourcePath, MAX_SIDE_CHAT_EXPORT_BYTES)
      const copied = await copyBytesToDropDir(workspacePath, '.dsh-side-chat-exports', request.name, bytes)
      return registerContained(copied.path, workspacePath, request.parentSessionId, safeName(request.name))
    },
  }
}
