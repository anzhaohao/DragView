// src/copy.ts
import { basename as basename2, isAbsolute as isAbsolute2 } from "node:path";

// src/file-access.js
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
var FILE_DROP_ROUTE = "/file-drop";
var RESOLVE_ROUTE = `${FILE_DROP_ROUTE}/resolve`;
var COPY_ROUTE = `${FILE_DROP_ROUTE}/copy`;
var CONFIG_ROUTE = `${FILE_DROP_ROUTE}/config`;
var SETTINGS_ROUTE = `${FILE_DROP_ROUTE}/settings`;
var PREVIEW_ROUTE = `${FILE_DROP_ROUTE}/preview`;
var TEXT_PREVIEW_ROUTE = `${FILE_DROP_ROUTE}/text-preview`;
var OPEN_ROUTE = `${FILE_DROP_ROUTE}/open`;
var REVOKE_ROUTE = `${FILE_DROP_ROUTE}/revoke`;
var SAMPLE_BYTES = 64 * 1024;
var SMALL_FILE_BYTES = 8 * 1024 * 1024;
var TEXT_READ_BYTES = 1024 * 1024;
var MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;
var FILE_TOKEN_TTL_MS = 4 * 60 * 60 * 1e3;
var RESOLUTION_TTL_MS = 5 * 60 * 1e3;
var TYPE_MAP = Object.freeze({
  pdf: { mediaType: "application/pdf", typeLabel: "PDF", previewKind: "pdf" },
  txt: { mediaType: "text/plain", typeLabel: "\u6587\u672C", previewKind: "text" },
  md: { mediaType: "text/markdown", typeLabel: "Markdown", previewKind: "text" },
  markdown: { mediaType: "text/markdown", typeLabel: "Markdown", previewKind: "text" },
  json: { mediaType: "application/json", typeLabel: "JSON", previewKind: "text" },
  csv: { mediaType: "text/csv", typeLabel: "CSV", previewKind: "text" },
  log: { mediaType: "text/plain", typeLabel: "\u65E5\u5FD7", previewKind: "text" },
  yaml: { mediaType: "text/yaml", typeLabel: "YAML", previewKind: "text" },
  yml: { mediaType: "text/yaml", typeLabel: "YAML", previewKind: "text" },
  xml: { mediaType: "application/xml", typeLabel: "XML", previewKind: "text" },
  html: { mediaType: "text/html", typeLabel: "HTML", previewKind: "text" },
  css: { mediaType: "text/css", typeLabel: "CSS", previewKind: "text" },
  js: { mediaType: "text/javascript", typeLabel: "JavaScript", previewKind: "text" },
  jsx: { mediaType: "text/plain", typeLabel: "JSX", previewKind: "text" },
  ts: { mediaType: "text/plain", typeLabel: "TypeScript", previewKind: "text" },
  tsx: { mediaType: "text/plain", typeLabel: "TSX", previewKind: "text" },
  py: { mediaType: "text/x-python", typeLabel: "Python", previewKind: "text" },
  go: { mediaType: "text/plain", typeLabel: "Go", previewKind: "text" },
  rs: { mediaType: "text/plain", typeLabel: "Rust", previewKind: "text" },
  java: { mediaType: "text/plain", typeLabel: "Java", previewKind: "text" },
  c: { mediaType: "text/plain", typeLabel: "C", previewKind: "text" },
  cpp: { mediaType: "text/plain", typeLabel: "C++", previewKind: "text" },
  h: { mediaType: "text/plain", typeLabel: "\u5934\u6587\u4EF6", previewKind: "text" },
  sh: { mediaType: "text/plain", typeLabel: "Shell", previewKind: "text" },
  ps1: { mediaType: "text/plain", typeLabel: "PowerShell", previewKind: "text" },
  sql: { mediaType: "text/plain", typeLabel: "SQL", previewKind: "text" },
  toml: { mediaType: "text/plain", typeLabel: "TOML", previewKind: "text" },
  mp4: { mediaType: "video/mp4", typeLabel: "MP4 \u89C6\u9891", previewKind: "video" },
  webm: { mediaType: "video/webm", typeLabel: "WebM \u89C6\u9891", previewKind: "video" },
  mov: { mediaType: "video/quicktime", typeLabel: "MOV \u89C6\u9891", previewKind: "video" },
  m4v: { mediaType: "video/x-m4v", typeLabel: "M4V \u89C6\u9891", previewKind: "video" },
  mp3: { mediaType: "audio/mpeg", typeLabel: "MP3 \u97F3\u9891", previewKind: "audio" },
  wav: { mediaType: "audio/wav", typeLabel: "WAV \u97F3\u9891", previewKind: "audio" },
  flac: { mediaType: "audio/flac", typeLabel: "FLAC \u97F3\u9891", previewKind: "audio" },
  m4a: { mediaType: "audio/mp4", typeLabel: "M4A \u97F3\u9891", previewKind: "audio" },
  ogg: { mediaType: "audio/ogg", typeLabel: "OGG \u97F3\u9891", previewKind: "audio" },
  doc: { mediaType: "application/msword", typeLabel: "Word \u6587\u6863", previewKind: "system" },
  docx: { mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", typeLabel: "Word \u6587\u6863", previewKind: "system" },
  xls: { mediaType: "application/vnd.ms-excel", typeLabel: "Excel \u8868\u683C", previewKind: "system" },
  xlsx: { mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", typeLabel: "Excel \u8868\u683C", previewKind: "system" },
  ppt: { mediaType: "application/vnd.ms-powerpoint", typeLabel: "PowerPoint \u6F14\u793A\u6587\u7A3F", previewKind: "system" },
  pptx: { mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", typeLabel: "PowerPoint \u6F14\u793A\u6587\u7A3F", previewKind: "system" },
  zip: { mediaType: "application/zip", typeLabel: "ZIP \u538B\u7F29\u5305", previewKind: "system" },
  rar: { mediaType: "application/vnd.rar", typeLabel: "RAR \u538B\u7F29\u5305", previewKind: "system" },
  "7z": { mediaType: "application/x-7z-compressed", typeLabel: "7Z \u538B\u7F29\u5305", previewKind: "system" },
  tar: { mediaType: "application/x-tar", typeLabel: "TAR \u538B\u7F29\u5305", previewKind: "system" },
  gz: { mediaType: "application/gzip", typeLabel: "GZip \u538B\u7F29\u5305", previewKind: "system" }
});
function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}
function assertSafeRelativeDirectory(value) {
  if (typeof value !== "string" || value.trim() === "" || isAbsolute(value)) {
    throw new Error("dropDir must be a non-empty relative directory");
  }
  const segments = value.replaceAll("\\", "/").split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((part) => part === "." || part === ".." || /[\x00-\x1f:*?"<>|]/.test(part))) {
    throw new Error("dropDir contains an unsafe path segment");
  }
  return segments;
}
function workspacePathForSession(workspaces, sessionId) {
  if (typeof sessionId !== "string" || sessionId.length === 0) return void 0;
  return workspaces.find((workspace) => workspace.sessionIds?.includes(sessionId))?.path;
}
async function ensureContainedDirectory(rootInput, dropDir) {
  const rootInfo = await lstat(resolve(rootInput));
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error("workspace root cannot be a symbolic link or junction");
  const root = await realpath(rootInput);
  if (!(await stat(root)).isDirectory()) throw new Error("workspace is not a directory");
  let current = root;
  for (const segment of assertSafeRelativeDirectory(dropDir)) {
    const next = resolve(current, segment);
    if (!inside(root, next)) throw new Error("dropDir escapes the workspace");
    try {
      const info = await lstat(next);
      if (info.isSymbolicLink()) throw new Error("dropDir cannot traverse a symbolic link or junction");
      if (!info.isDirectory()) throw new Error("dropDir collides with a non-directory");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await mkdir(next);
    }
    current = await realpath(next);
    if (!inside(root, current)) throw new Error("dropDir resolves outside the workspace");
  }
  return { root, directory: current };
}
async function assertContainedFile(rootInput, targetInput) {
  const rootInfo = await lstat(resolve(rootInput));
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error("trusted root cannot be a symbolic link or junction");
  const root = await realpath(rootInput);
  const target = await realpath(targetInput);
  if (!inside(root, target)) throw new Error("written attachment resolves outside the workspace");
  const requestedRoot = resolve(rootInput);
  const requestedTarget = resolve(targetInput);
  const lexicalInside = inside(requestedRoot, requestedTarget);
  const sameCanonicalTarget = process.platform === "win32" ? requestedTarget.toLowerCase() === target.toLowerCase() : requestedTarget === target;
  if (!lexicalInside && !sameCanonicalTarget) throw new Error("attachment path escapes its trusted root");
  const lexicalRoot = lexicalInside ? requestedRoot : root;
  const lexicalTarget = lexicalInside ? requestedTarget : target;
  let current = lexicalRoot;
  const segments = relative(lexicalRoot, lexicalTarget).split(sep).filter(Boolean);
  for (const segment of segments) {
    current = resolve(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error("attachment path cannot traverse a symbolic link or junction");
  }
  if (!(await stat(target)).isFile()) throw new Error("written attachment is not a file");
  return target;
}
async function readContainedFile(rootInput, targetInput, maxBytes) {
  const canonical = await assertContainedFile(rootInput, targetInput);
  const before = await stat(canonical);
  if (before.size > maxBytes) throw new Error("attachment is too large");
  const bytes = await readFile(canonical);
  const afterCanonical = await assertContainedFile(rootInput, targetInput);
  const after = await stat(afterCanonical);
  if (afterCanonical !== canonical || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.dev !== before.dev || after.ino !== before.ino || bytes.length !== before.size) {
    throw new Error("attachment changed while it was being read");
  }
  return bytes;
}
async function writeUniqueFile(directory, rawName, bytes) {
  const stem = basename(String(rawName ?? "")).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 120) || "file";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const target = resolve(directory, `${Date.now()}-${randomBytes(4).toString("hex")}-${stem}`);
    const handle = await open(target, "wx").catch((error) => {
      if (error.code === "EEXIST") return void 0;
      throw error;
    });
    if (handle === void 0) continue;
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
    return target;
  }
  throw new Error("could not allocate a unique attachment name");
}

// src/copy.ts
var MAX_COPY_BYTES = 100 * 1024 * 1024;
function safeName(raw) {
  const base = basename2(String(raw ?? "")).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 120);
  return base.length === 0 ? "file" : base;
}
async function copyBytesToDropDir(root, dropDir, rawName, bytes) {
  if (!isAbsolute2(root)) throw new Error(`workspace root must be absolute, got "${root}"`);
  const safe = safeName(rawName);
  const { root: canonicalRoot, directory } = await ensureContainedDirectory(root, dropDir);
  const target = await writeUniqueFile(directory, safe, bytes);
  const canonicalTarget = await assertContainedFile(canonicalRoot, target);
  return { path: canonicalTarget, filename: basename2(canonicalTarget) };
}

// src/side-chat-bridge.ts
var MAX_SIDE_CHAT_EXPORT_BYTES = 4 * 1024 * 1024;
function createSideChatExportRegistrar(input) {
  const registerContained = async (filePath, root, sessionId, name) => {
    const canonical = await assertContainedFile(root, filePath);
    const file = await input.files.register(canonical, sessionId, name);
    try {
      await assertContainedFile(root, filePath);
    } catch (error) {
      input.files.revoke(file.id, sessionId);
      throw error;
    }
    return file;
  };
  return {
    registerSideChatExport: async (request) => {
      if (request.mediaType !== "text/markdown" || typeof request.name !== "string" || !request.name.toLowerCase().endsWith(".md")) throw new Error("invalid Side Chat Markdown export");
      const workspaces = input.registry.list();
      const workspacePath = workspacePathForSession(workspaces, request.parentSessionId);
      if (workspacePath === void 0) throw new Error("unknown parent session workspace");
      await assertContainedFile(input.exportRoot, request.sourcePath);
      if (input.config().mode === "resolve") {
        return registerContained(request.sourcePath, input.exportRoot, request.parentSessionId, safeName(request.name));
      }
      const bytes = await readContainedFile(input.exportRoot, request.sourcePath, MAX_SIDE_CHAT_EXPORT_BYTES);
      const copied = await copyBytesToDropDir(workspacePath, ".dsh-side-chat-exports", request.name, bytes);
      return registerContained(copied.path, workspacePath, request.parentSessionId, safeName(request.name));
    }
  };
}
export {
  MAX_SIDE_CHAT_EXPORT_BYTES,
  createSideChatExportRegistrar
};
