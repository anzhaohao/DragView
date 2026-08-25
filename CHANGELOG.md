# Changelog

All notable changes to DragView are documented here. The project follows Semantic Versioning.

## 0.1.1 - 2026-08-25

### Added

- Sent-message file cards: `@"path"` references in the conversation now render as the same Codex-style card shown in the composer (icon tile + name + type/size), and remain clickable for in-app preview or system-default open.

### Changed

- Attachments are no longer revoked on send; their tokens stay live (still session-bound, 4 h TTL, identity-revalidated) so the sent cards can keep previewing. Tokens are revoked on card removal, page hide, and plugin unload as before.

## 0.1.0 - 2026-08-25

Initial public release.

### Added

- Drag-and-drop non-image attachments with `resolve` and `copy` workspace modes.
- Codex-style file cards that share a wrapping attachment rail with native DSH images while keeping side-chat references on a separate row.
- Secure in-app PDF, text, Markdown, code, JSON, CSV, log, video, and audio previews.
- Safe system-default opening for Office documents, archives, and unknown binary files.
- Opaque, short-lived host file capabilities with path normalization, realpath containment, identity revalidation, bounded text reads, and HTTP Range support.
- Keyboard interaction, focus restoration, light/dark themes, long-name handling, and side-chat export bridge compatibility.

### Security

- Preview and open routes accept only host-issued file IDs and never arbitrary client paths.
- System opening uses argument arrays with `shell: false`.
- Text preview responses are forced to inert plain text with restrictive response headers.

### Known limits

- Office and unknown binary opening depends on the operating system's file association.
- Node does not expose a portable `openat` workflow, so the documented narrow same-user TOCTOU boundary remains for controlled writes and system-open handoff.
