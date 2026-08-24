// src/file-access.ts
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";

// src/protocol.ts
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

// src/file-access.ts
var FILE_TOKEN_TTL_MS = 4 * 60 * 60 * 1e3;
var RESOLUTION_TTL_MS = 5 * 60 * 1e3;
var MAX_FILE_TOKENS = 256;
var MAX_RESOLUTIONS = 64;
function resolutionDecision(phase, fileSize, candidateCount) {
  if (candidateCount <= 0) return "not-found";
  if (phase === "metadata") return "sample-required";
  if (phase === "sample" && fileSize > SAMPLE_BYTES * 3) return "full-required";
  return candidateCount === 1 ? "found" : "choose";
}
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
function classifyFile(name) {
  const extension = extname(name).slice(1).toLowerCase();
  return TYPE_MAP[extension] ?? {
    mediaType: "application/octet-stream",
    typeLabel: extension ? `${extension.toUpperCase()} \u6587\u4EF6` : "\u6587\u4EF6",
    previewKind: "system"
  };
}
function opaqueId() {
  return randomBytes(24).toString("base64url");
}
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
var FileTokenRegistry = class {
  constructor(now = Date.now) {
    this.now = now;
  }
  entries = /* @__PURE__ */ new Map();
  async register(filePath, sessionId, displayName) {
    if (typeof sessionId !== "string" || sessionId.length === 0) throw new Error("registered attachment has no session");
    const canonical = await realpath(filePath);
    const info = await stat(canonical);
    if (!info.isFile()) throw new Error("registered attachment is not a file");
    const name = basename(displayName || canonical);
    const kind = classifyFile(name);
    this.prune();
    while (this.entries.size >= MAX_FILE_TOKENS) this.entries.delete(this.entries.keys().next().value);
    const id = opaqueId();
    this.entries.set(id, {
      path: canonical,
      realPath: canonical,
      sessionId,
      name,
      size: info.size,
      mtimeMs: info.mtimeMs,
      dev: info.dev,
      ino: info.ino,
      ...kind,
      expiresAt: this.now() + FILE_TOKEN_TTL_MS
    });
    return { id, ref: canonical, sessionId, name, size: info.size, ...kind };
  }
  async access(id, sessionId) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(id) || typeof sessionId !== "string" || sessionId.length === 0) return void 0;
    const entry = this.entries.get(id);
    if (entry === void 0 || entry.sessionId !== sessionId) return void 0;
    if (entry.expiresAt <= this.now()) {
      if (entry !== void 0) this.entries.delete(id);
      return void 0;
    }
    try {
      const canonical = await realpath(entry.path);
      const info = await stat(canonical);
      if (!info.isFile() || canonical !== entry.realPath || info.size !== entry.size || info.mtimeMs !== entry.mtimeMs || info.dev !== entry.dev || info.ino !== entry.ino) {
        this.entries.delete(id);
        return void 0;
      }
      entry.expiresAt = this.now() + FILE_TOKEN_TTL_MS;
      return entry;
    } catch {
      this.entries.delete(id);
      return void 0;
    }
  }
  async openVerified(id, sessionId) {
    const entry = await this.access(id, sessionId);
    if (entry === void 0) return void 0;
    let handle;
    try {
      handle = await open(entry.path, "r");
      const info = await handle.stat();
      if (!info.isFile() || info.size !== entry.size || info.mtimeMs !== entry.mtimeMs || info.dev !== entry.dev || info.ino !== entry.ino) {
        this.entries.delete(String(id));
        await handle.close();
        return void 0;
      }
      return { entry, handle };
    } catch {
      if (handle !== void 0) await handle.close().catch(() => void 0);
      this.entries.delete(String(id));
      return void 0;
    }
  }
  revoke(id, sessionId) {
    const entry = typeof id === "string" ? this.entries.get(id) : void 0;
    return entry !== void 0 && entry.sessionId === sessionId && this.entries.delete(id);
  }
  clear() {
    this.entries.clear();
  }
  prune() {
    const now = this.now();
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(id);
  }
};
function parseSingleRange(header, size) {
  if (header === void 0) return void 0;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return null;
  const [, startText, endText] = match;
  let start;
  let end;
  if (startText === "") {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText === "" ? size - 1 : Number(endText);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}
function inlineDisposition(name) {
  const fallback = basename(name).replace(/[^\x20-\x7e]|["\\]/g, "_") || "file";
  const encoded = encodeURIComponent(basename(name)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
function textPreviewHeaders(entry, contentLength, truncated) {
  return {
    "content-type": "text/plain; charset=utf-8",
    "content-disposition": inlineDisposition(entry.name),
    "content-length": contentLength,
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'; base-uri 'none'",
    "x-dsh-drag-file-truncated": truncated ? "1" : "0"
  };
}
async function streamRegisteredFile(res, entry, rangeHeader, head = false, handle) {
  const range = parseSingleRange(rangeHeader, entry.size);
  const headers = {
    "content-type": entry.mediaType,
    "content-disposition": inlineDisposition(entry.name),
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes"
  };
  const pipeStream = async (start, end) => {
    let stream;
    try {
      const options = start === void 0 ? { autoClose: true } : { start, end, autoClose: true };
      stream = handle?.createReadStream(options) ?? createReadStream(entry.path, options);
      const destroyStream = () => stream?.destroy();
      res.once("close", destroyStream);
      stream.once("close", () => res.off("close", destroyStream));
      stream.on("error", () => res.destroy()).pipe(res);
    } catch (error) {
      if (stream !== void 0) stream.destroy();
      else await handle?.close().catch(() => void 0);
      throw error;
    }
  };
  if (range === null) {
    res.writeHead(416, { ...headers, "content-range": `bytes */${entry.size}` });
    try {
      await handle?.close();
    } finally {
      res.end();
    }
    return;
  }
  if (range === void 0) {
    res.writeHead(200, { ...headers, "content-length": entry.size });
    if (head) {
      try {
        await handle?.close();
      } finally {
        res.end();
      }
      return;
    }
    await pipeStream();
    return;
  }
  const length = range.end - range.start + 1;
  res.writeHead(206, { ...headers, "content-length": length, "content-range": `bytes ${range.start}-${range.end}/${entry.size}` });
  if (head) {
    try {
      await handle?.close();
    } finally {
      res.end();
    }
    return;
  }
  await pipeStream(range.start, range.end);
}
function systemOpenCommand(filePath, platform = process.platform) {
  if (platform === "win32") return { command: "explorer.exe", args: [filePath], options: { shell: false, detached: true, stdio: "ignore", windowsHide: true } };
  if (platform === "darwin") return { command: "open", args: [filePath], options: { shell: false, detached: true, stdio: "ignore" } };
  return { command: "xdg-open", args: [filePath], options: { shell: false, detached: true, stdio: "ignore" } };
}
function openWithSystem(filePath) {
  const spec = systemOpenCommand(filePath);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(spec.command, [...spec.args], spec.options);
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolvePromise();
    });
  });
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
export {
  FILE_TOKEN_TTL_MS,
  FileTokenRegistry,
  MAX_FILE_TOKENS,
  MAX_RESOLUTIONS,
  RESOLUTION_TTL_MS,
  assertContainedFile,
  assertSafeRelativeDirectory,
  classifyFile,
  ensureContainedDirectory,
  inlineDisposition,
  openWithSystem,
  parseSingleRange,
  readContainedFile,
  resolutionDecision,
  streamRegisteredFile,
  systemOpenCommand,
  textPreviewHeaders,
  workspacePathForSession,
  writeUniqueFile
};
