// src/index.ts
import { Buffer as Buffer2 } from "node:buffer";
import { randomBytes as randomBytes3 } from "node:crypto";
import os from "node:os";
import path from "node:path";
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

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
function systemOpenCommand(filePath, platform2 = process.platform) {
  if (platform2 === "win32") return { command: "explorer.exe", args: [filePath], options: { shell: false, detached: true, stdio: "ignore", windowsHide: true } };
  if (platform2 === "darwin") return { command: "open", args: [filePath], options: { shell: false, detached: true, stdio: "ignore" } };
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

// src/locator.ts
import { homedir as homedir2 } from "node:os";
import { basename as basename3, join as join2, normalize, resolve as resolve2, sep as sep2 } from "node:path";
import { readdir as readdir2, stat as stat3 } from "node:fs/promises";

// src/fingerprint.js
import { createHash } from "node:crypto";
import { open as open2, stat as stat2 } from "node:fs/promises";
var FILE_DROP_ROUTE2 = "/file-drop";
var RESOLVE_ROUTE2 = `${FILE_DROP_ROUTE2}/resolve`;
var COPY_ROUTE2 = `${FILE_DROP_ROUTE2}/copy`;
var CONFIG_ROUTE2 = `${FILE_DROP_ROUTE2}/config`;
var SETTINGS_ROUTE2 = `${FILE_DROP_ROUTE2}/settings`;
var PREVIEW_ROUTE2 = `${FILE_DROP_ROUTE2}/preview`;
var TEXT_PREVIEW_ROUTE2 = `${FILE_DROP_ROUTE2}/text-preview`;
var OPEN_ROUTE2 = `${FILE_DROP_ROUTE2}/open`;
var REVOKE_ROUTE2 = `${FILE_DROP_ROUTE2}/revoke`;
var SAMPLE_BYTES2 = 64 * 1024;
var SMALL_FILE_BYTES2 = 8 * 1024 * 1024;
var TEXT_READ_BYTES2 = 1024 * 1024;
var MAX_TEXT_FILE_BYTES2 = 10 * 1024 * 1024;
function sampleRanges(size) {
  if (!Number.isSafeInteger(size) || size < 0) throw new TypeError("size must be a non-negative safe integer");
  if (size <= SAMPLE_BYTES2 * 3) return [{ start: 0, length: size }];
  return [
    0,
    Math.max(0, Math.floor(size / 2) - Math.floor(SAMPLE_BYTES2 / 2)),
    size - SAMPLE_BYTES2
  ].map((start) => ({ start, length: Math.min(SAMPLE_BYTES2, size - start) }));
}
function hashParts(size, parts) {
  const hash = createHash("sha256");
  const header = Buffer.allocUnsafe(8);
  header.writeBigUInt64BE(BigInt(size));
  hash.update(header);
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}
async function sampleFingerprint(path2, size) {
  const handle = await open2(path2, "r");
  try {
    const parts = [];
    for (const range of sampleRanges(size)) {
      const buffer = Buffer.allocUnsafe(range.length);
      const { bytesRead } = await handle.read(buffer, 0, range.length, range.start);
      parts.push(buffer.subarray(0, bytesRead));
    }
    return hashParts(size, parts);
  } finally {
    await handle.close();
  }
}
async function fullFingerprint(path2) {
  const size = (await stat2(path2)).size;
  const handle = await open2(path2, "r");
  try {
    const hash = createHash("sha256");
    const header = Buffer.allocUnsafe(8);
    header.writeBigUInt64BE(BigInt(size));
    hash.update(header);
    const buffer = Buffer.allocUnsafe(256 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

// src/platform-search.ts
import { execFile } from "node:child_process";
import { access, constants, readdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var COMMAND_TIMEOUT_MS = 3e3;
var PLATFORM_MAX_CANDIDATES = 100;
var host = {
  platform: platform(),
  home: homedir(),
  async commandExists(command) {
    if (command.includes("/") || command.includes("\\")) {
      try {
        await access(command, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }
    const probe = platform() === "win32" ? "where.exe" : "/usr/bin/env";
    const args = platform() === "win32" ? [command] : ["sh", "-c", 'command -v "$1" >/dev/null 2>&1', "sh", command];
    try {
      await execFileAsync(probe, args, { timeout: 1e3 });
      return true;
    } catch {
      return false;
    }
  },
  async exec(command, args) {
    const { stdout } = await execFileAsync(command, [...args], {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    });
    return stdout;
  },
  async execBuffer(command, args) {
    return new Promise((resolve4, reject) => {
      execFile(command, [...args], {
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        encoding: "buffer"
      }, (error, stdout) => {
        if (error) reject(error);
        else resolve4(stdout);
      });
    });
  },
  async windowsDrives() {
    try {
      const output = await this.exec("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        '[System.IO.DriveInfo]::GetDrives() | Where-Object {$_.DriveType -eq "Fixed" -and $_.IsReady} | ForEach-Object {$_.RootDirectory.FullName}'
      ]);
      return output.split(/\r?\n/).filter(Boolean);
    } catch {
      return [];
    }
  }
};
function lines(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, PLATFORM_MAX_CANDIDATES);
}
async function macSearch(name, runtime) {
  const escaped = name.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  try {
    return lines(await runtime.exec("/usr/bin/mdfind", [`kMDItemFSName == "${escaped}"c`]));
  } catch {
    return [];
  }
}
async function linuxSearch(name, runtime) {
  for (const command of ["plocate", "locate"]) {
    if (!await runtime.commandExists(command)) continue;
    try {
      const paths = lines(await runtime.exec(command, ["--basename", "--limit", String(PLATFORM_MAX_CANDIDATES * 4), name]));
      return paths.filter((path2) => path2.split("/").at(-1) === name).slice(0, PLATFORM_MAX_CANDIDATES);
    } catch {
    }
  }
  return [];
}
function powershellLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
function decodeWindowsOutput(raw, name) {
  let best = "";
  let bestScore = -1;
  for (const decoder of [new TextDecoder("utf-8"), new TextDecoder("gbk")]) {
    const text = decoder.decode(raw);
    const score = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => line.split(/[\\/]/).at(-1) === name).length;
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  }
  return best;
}
async function windowsSearch(name, runtime) {
  if (await runtime.commandExists("es.exe")) {
    try {
      const raw = await runtime.execBuffer("es.exe", ["-n", String(PLATFORM_MAX_CANDIDATES), "-w", name]);
      return lines(decodeWindowsOutput(raw, name));
    } catch {
    }
  }
  if (!await runtime.commandExists("powershell.exe")) return [];
  const roots = [runtime.home, ...await runtime.windowsDrives()];
  const script = [
    `$name=${powershellLiteral(name)}`,
    `$roots=@(${roots.map(powershellLiteral).join(",")}) | Select-Object -Unique`,
    `$roots | ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter $name -File -Recurse -Force -ErrorAction SilentlyContinue }`,
    `| Select-Object -First ${String(PLATFORM_MAX_CANDIDATES)} -ExpandProperty FullName`
  ].join(" ");
  try {
    const raw = await runtime.execBuffer("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
    return lines(decodeWindowsOutput(raw, name));
  } catch {
    return [];
  }
}
async function indexedSearch(name, runtime = host) {
  if (runtime.platform === "darwin") return macSearch(name, runtime);
  if (runtime.platform === "linux") return linuxSearch(name, runtime);
  if (runtime.platform === "win32") return windowsSearch(name, runtime);
  return [];
}
async function broadSearchRoots(runtime = host) {
  if (runtime.platform === "linux") {
    const roots = [runtime.home];
    for (const parent of ["/mnt", "/media"]) {
      try {
        for (const entry of await readdir(parent, { withFileTypes: true })) {
          if (entry.isDirectory()) roots.push(join(parent, entry.name));
        }
      } catch {
      }
    }
    return roots;
  }
  if (runtime.platform === "win32") return [runtime.home, ...await runtime.windowsDrives()];
  return [];
}

// src/locator.ts
var MAX_CANDIDATES = 100;
var MAX_WALK_ENTRIES = 2e4;
var WALK_DEPTH = 12;
var SHALLOW_MAX_DIRS = 4096;
async function directCandidate(root, name) {
  const path2 = join2(root, name);
  try {
    const info = await stat3(path2);
    return info.isFile() ? path2 : void 0;
  } catch {
    return void 0;
  }
}
async function walkByName(root, name, depth = WALK_DEPTH) {
  const found = [];
  let visited = 0;
  const visit = async (directory, remaining) => {
    if (remaining < 0 || found.length >= MAX_CANDIDATES || visited >= MAX_WALK_ENTRIES) return;
    let entries;
    try {
      entries = await readdir2(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (++visited >= MAX_WALK_ENTRIES || found.length >= MAX_CANDIDATES) break;
      const path2 = join2(directory, entry.name);
      if (entry.name === name && entry.isFile()) found.push(path2);
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(path2, remaining - 1);
    }
  };
  await visit(root, depth);
  return found;
}
async function validateCandidates(item, paths) {
  const candidates = [];
  for (const path2 of [...new Set(paths)].slice(0, MAX_CANDIDATES)) {
    try {
      const info = await stat3(path2);
      if (info.isFile() && info.size === item.size && basename3(path2) === item.name) {
        candidates.push({ path: normalize(path2), mtimeMs: info.mtimeMs });
      }
    } catch {
    }
  }
  return candidates.sort(
    (a, b) => Math.abs(a.mtimeMs - item.lastModified) - Math.abs(b.mtimeMs - item.lastModified) || a.path.localeCompare(b.path)
  );
}
async function shallowCandidates(item, roots) {
  const paths = [];
  for (const root of roots) {
    const direct = await directCandidate(root, item.name);
    if (direct !== void 0) paths.push(direct);
    let entries;
    try {
      entries = await readdir2(root, { withFileTypes: true });
    } catch {
      continue;
    }
    let expanded = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (expanded >= SHALLOW_MAX_DIRS) break;
      expanded += 1;
      const directory = join2(root, entry.name);
      const nested = await directCandidate(directory, item.name);
      if (nested !== void 0) paths.push(nested);
      let grandchildren;
      try {
        grandchildren = await readdir2(directory, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const grandchild of grandchildren) {
        if (!grandchild.isDirectory() || grandchild.isSymbolicLink()) continue;
        const deep = await directCandidate(join2(directory, grandchild.name), item.name);
        if (deep !== void 0) paths.push(deep);
      }
    }
  }
  return validateCandidates(item, paths);
}
async function recursiveCandidates(item, roots) {
  const paths = [];
  for (const root of roots) paths.push(...await walkByName(root, item.name));
  return validateCandidates(item, paths);
}
function pathsInside(paths, roots) {
  const canonicalRoots = roots.map((root) => resolve2(root));
  return paths.filter((path2) => {
    const candidate = resolve2(path2);
    return canonicalRoots.some((root) => candidate === root || candidate.startsWith(`${root}${sep2}`));
  });
}
async function metadataCandidates(item, current, registeredWorkspaceRoots) {
  const workspaceRoots = [...new Set(registeredWorkspaceRoots)].filter((root) => typeof root === "string" && root !== "");
  const otherWorkspaces = workspaceRoots.filter((root) => root !== current);
  const commonRoots = [join2(homedir2(), "Desktop"), join2(homedir2(), "Documents"), join2(homedir2(), "Downloads")];
  const rootGroups = [current === void 0 ? [] : [current], otherWorkspaces, commonRoots];
  const indexedPaths = await indexedSearch(item.name);
  for (const roots of rootGroups) {
    const shallow = await shallowCandidates(item, roots);
    if (shallow.length > 0) return shallow;
    const indexed = await validateCandidates(item, pathsInside(indexedPaths, roots));
    if (indexed.length > 0) return indexed;
    const recursive = await recursiveCandidates(item, roots);
    if (recursive.length > 0) return recursive;
  }
  const globalIndexed = await validateCandidates(item, indexedPaths);
  if (globalIndexed.length > 0) return globalIndexed;
  return recursiveCandidates(item, await broadSearchRoots());
}
async function matchingFileDigest(candidates, digest, phase, file) {
  const matched = [];
  for (const path2 of candidates.slice(0, MAX_CANDIDATES)) {
    try {
      const actual = phase === "sample" ? await sampleFingerprint(path2, file.size) : await fullFingerprint(path2);
      if (actual === digest) matched.push(path2);
    } catch {
    }
  }
  return matched;
}
function validDroppedFile(file) {
  return file?.kind === "file" && typeof file.name === "string" && file.name !== "" && Number.isSafeInteger(file.size) && file.size >= 0 && Number.isFinite(file.lastModified) && file.lastModified >= 0;
}

// src/protocol.ts
var FILE_DROP_ROUTE3 = "/file-drop";
var RESOLVE_ROUTE3 = `${FILE_DROP_ROUTE3}/resolve`;
var COPY_ROUTE3 = `${FILE_DROP_ROUTE3}/copy`;
var CONFIG_ROUTE3 = `${FILE_DROP_ROUTE3}/config`;
var SETTINGS_ROUTE3 = `${FILE_DROP_ROUTE3}/settings`;
var PREVIEW_ROUTE3 = `${FILE_DROP_ROUTE3}/preview`;
var TEXT_PREVIEW_ROUTE3 = `${FILE_DROP_ROUTE3}/text-preview`;
var OPEN_ROUTE3 = `${FILE_DROP_ROUTE3}/open`;
var REVOKE_ROUTE3 = `${FILE_DROP_ROUTE3}/revoke`;
var SAMPLE_BYTES3 = 64 * 1024;
var SMALL_FILE_BYTES3 = 8 * 1024 * 1024;
var TEXT_READ_BYTES3 = 1024 * 1024;
var MAX_TEXT_FILE_BYTES3 = 10 * 1024 * 1024;

// src/side-chat-bridge.js
import { basename as basename22, isAbsolute as isAbsolute22 } from "node:path";
import { createReadStream as createReadStream2 } from "node:fs";
import { lstat as lstat2, mkdir as mkdir2, open as open3, readFile as readFile2, realpath as realpath2, stat as stat4 } from "node:fs/promises";
import { spawn as spawn2 } from "node:child_process";
import { randomBytes as randomBytes2 } from "node:crypto";
import { basename as basename4, extname as extname2, isAbsolute as isAbsolute3, relative as relative2, resolve as resolve3, sep as sep3 } from "node:path";
var FILE_DROP_ROUTE4 = "/file-drop";
var RESOLVE_ROUTE4 = `${FILE_DROP_ROUTE4}/resolve`;
var COPY_ROUTE4 = `${FILE_DROP_ROUTE4}/copy`;
var CONFIG_ROUTE4 = `${FILE_DROP_ROUTE4}/config`;
var SETTINGS_ROUTE4 = `${FILE_DROP_ROUTE4}/settings`;
var PREVIEW_ROUTE4 = `${FILE_DROP_ROUTE4}/preview`;
var TEXT_PREVIEW_ROUTE4 = `${FILE_DROP_ROUTE4}/text-preview`;
var OPEN_ROUTE4 = `${FILE_DROP_ROUTE4}/open`;
var REVOKE_ROUTE4 = `${FILE_DROP_ROUTE4}/revoke`;
var SAMPLE_BYTES4 = 64 * 1024;
var SMALL_FILE_BYTES4 = 8 * 1024 * 1024;
var TEXT_READ_BYTES4 = 1024 * 1024;
var MAX_TEXT_FILE_BYTES4 = 10 * 1024 * 1024;
var FILE_TOKEN_TTL_MS2 = 4 * 60 * 60 * 1e3;
var RESOLUTION_TTL_MS2 = 5 * 60 * 1e3;
var TYPE_MAP2 = Object.freeze({
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
function inside2(root, target) {
  const rel = relative2(root, target);
  return rel === "" || !rel.startsWith(`..${sep3}`) && rel !== ".." && !isAbsolute3(rel);
}
function assertSafeRelativeDirectory2(value) {
  if (typeof value !== "string" || value.trim() === "" || isAbsolute3(value)) {
    throw new Error("dropDir must be a non-empty relative directory");
  }
  const segments = value.replaceAll("\\", "/").split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((part) => part === "." || part === ".." || /[\x00-\x1f:*?"<>|]/.test(part))) {
    throw new Error("dropDir contains an unsafe path segment");
  }
  return segments;
}
function workspacePathForSession2(workspaces, sessionId) {
  if (typeof sessionId !== "string" || sessionId.length === 0) return void 0;
  return workspaces.find((workspace) => workspace.sessionIds?.includes(sessionId))?.path;
}
async function ensureContainedDirectory2(rootInput, dropDir) {
  const rootInfo = await lstat2(resolve3(rootInput));
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error("workspace root cannot be a symbolic link or junction");
  const root = await realpath2(rootInput);
  if (!(await stat4(root)).isDirectory()) throw new Error("workspace is not a directory");
  let current = root;
  for (const segment of assertSafeRelativeDirectory2(dropDir)) {
    const next = resolve3(current, segment);
    if (!inside2(root, next)) throw new Error("dropDir escapes the workspace");
    try {
      const info = await lstat2(next);
      if (info.isSymbolicLink()) throw new Error("dropDir cannot traverse a symbolic link or junction");
      if (!info.isDirectory()) throw new Error("dropDir collides with a non-directory");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await mkdir2(next);
    }
    current = await realpath2(next);
    if (!inside2(root, current)) throw new Error("dropDir resolves outside the workspace");
  }
  return { root, directory: current };
}
async function assertContainedFile2(rootInput, targetInput) {
  const rootInfo = await lstat2(resolve3(rootInput));
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error("trusted root cannot be a symbolic link or junction");
  const root = await realpath2(rootInput);
  const target = await realpath2(targetInput);
  if (!inside2(root, target)) throw new Error("written attachment resolves outside the workspace");
  const requestedRoot = resolve3(rootInput);
  const requestedTarget = resolve3(targetInput);
  const lexicalInside = inside2(requestedRoot, requestedTarget);
  const sameCanonicalTarget = process.platform === "win32" ? requestedTarget.toLowerCase() === target.toLowerCase() : requestedTarget === target;
  if (!lexicalInside && !sameCanonicalTarget) throw new Error("attachment path escapes its trusted root");
  const lexicalRoot = lexicalInside ? requestedRoot : root;
  const lexicalTarget = lexicalInside ? requestedTarget : target;
  let current = lexicalRoot;
  const segments = relative2(lexicalRoot, lexicalTarget).split(sep3).filter(Boolean);
  for (const segment of segments) {
    current = resolve3(current, segment);
    const info = await lstat2(current);
    if (info.isSymbolicLink()) throw new Error("attachment path cannot traverse a symbolic link or junction");
  }
  if (!(await stat4(target)).isFile()) throw new Error("written attachment is not a file");
  return target;
}
async function readContainedFile(rootInput, targetInput, maxBytes) {
  const canonical = await assertContainedFile2(rootInput, targetInput);
  const before = await stat4(canonical);
  if (before.size > maxBytes) throw new Error("attachment is too large");
  const bytes = await readFile2(canonical);
  const afterCanonical = await assertContainedFile2(rootInput, targetInput);
  const after = await stat4(afterCanonical);
  if (afterCanonical !== canonical || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.dev !== before.dev || after.ino !== before.ino || bytes.length !== before.size) {
    throw new Error("attachment changed while it was being read");
  }
  return bytes;
}
async function writeUniqueFile2(directory, rawName, bytes) {
  const stem = basename4(String(rawName ?? "")).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 120) || "file";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const target = resolve3(directory, `${Date.now()}-${randomBytes2(4).toString("hex")}-${stem}`);
    const handle = await open3(target, "wx").catch((error) => {
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
var MAX_COPY_BYTES2 = 100 * 1024 * 1024;
function safeName2(raw) {
  const base = basename22(String(raw ?? "")).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 120);
  return base.length === 0 ? "file" : base;
}
async function copyBytesToDropDir2(root, dropDir, rawName, bytes) {
  if (!isAbsolute22(root)) throw new Error(`workspace root must be absolute, got "${root}"`);
  const safe = safeName2(rawName);
  const { root: canonicalRoot, directory } = await ensureContainedDirectory2(root, dropDir);
  const target = await writeUniqueFile2(directory, safe, bytes);
  const canonicalTarget = await assertContainedFile2(canonicalRoot, target);
  return { path: canonicalTarget, filename: basename22(canonicalTarget) };
}
var MAX_SIDE_CHAT_EXPORT_BYTES = 4 * 1024 * 1024;
function createSideChatExportRegistrar(input) {
  const registerContained = async (filePath, root, sessionId, name) => {
    const canonical = await assertContainedFile2(root, filePath);
    const file = await input.files.register(canonical, sessionId, name);
    try {
      await assertContainedFile2(root, filePath);
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
      const workspacePath = workspacePathForSession2(workspaces, request.parentSessionId);
      if (workspacePath === void 0) throw new Error("unknown parent session workspace");
      await assertContainedFile2(input.exportRoot, request.sourcePath);
      if (input.config().mode === "resolve") {
        return registerContained(request.sourcePath, input.exportRoot, request.parentSessionId, safeName2(request.name));
      }
      const bytes = await readContainedFile(input.exportRoot, request.sourcePath, MAX_SIDE_CHAT_EXPORT_BYTES);
      const copied = await copyBytesToDropDir2(workspacePath, ".dsh-side-chat-exports", request.name, bytes);
      return registerContained(copied.path, workspacePath, request.parentSessionId, safeName2(request.name));
    }
  };
}

// src/index.ts
var SETTINGS_NAMESPACE = settingsNamespace("drag-file");
var SETTINGS_SCHEMA = z.object({
  mode: z.union([z.const("resolve"), z.const("copy")]).default("resolve"),
  dropDir: z.string().default(".drops")
});
var DEFAULT_CONFIG = { mode: "resolve", dropDir: ".drops" };
var MAX_BODY_BYTES = 140 * 1024 * 1024;
async function readJsonBody(req, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer2.isBuffer(chunk) ? chunk : Buffer2.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer2.concat(chunks).toString("utf8"));
}
function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(body));
}
function opaqueId2() {
  return randomBytes3(24).toString("base64url");
}
function queryId(req) {
  try {
    return new URL(req.url ?? "", "http://localhost").searchParams.get("id") ?? void 0;
  } catch {
    return void 0;
  }
}
function querySessionId(req) {
  try {
    return new URL(req.url ?? "", "http://localhost").searchParams.get("sessionId") ?? void 0;
  } catch {
    return void 0;
  }
}
function sideChatExportRoot() {
  const dshHome = process.env.DSH_HOME || process.env.HANAKO_DSH_HOME;
  return dshHome ? path.join(path.resolve(dshHome), ".dsh-side-chat-plus-plus", "side-chat-exports") : path.join(os.tmpdir(), "dsh-side-chat-plus-plus", "side-chat-exports");
}
function workspaceForSession(registry, sessionId) {
  const workspaces = registry.list();
  const path2 = workspacePathForSession(workspaces, sessionId);
  return path2 === void 0 ? void 0 : workspaces.find((workspace) => workspace.path === path2);
}
function safeError(error, fallback) {
  const message = error instanceof Error ? error.message : fallback;
  return /[A-Za-z]:[\\/]|\/(?:Users|home|tmp)\//.test(message) ? fallback : message;
}
function apply(ctx) {
  let config = { ...DEFAULT_CONFIG };
  const files = new FileTokenRegistry();
  const resolutions = /* @__PURE__ */ new Map();
  const pruneResolutions = () => {
    const now = Date.now();
    for (const [id, entry] of resolutions) if (entry.expiresAt <= now) resolutions.delete(id);
    while (resolutions.size >= MAX_RESOLUTIONS) resolutions.delete(resolutions.keys().next().value);
  };
  const resolution = (id) => {
    if (typeof id !== "string") return void 0;
    const entry = resolutions.get(id);
    if (entry === void 0 || entry.expiresAt <= Date.now()) {
      resolutions.delete(id);
      return void 0;
    }
    entry.expiresAt = Date.now() + RESOLUTION_TTL_MS;
    return entry;
  };
  const found = async (path2, sessionId, name) => ({
    status: "found",
    file: await files.register(path2, sessionId, name)
  });
  const registerContained = async (path2, root, sessionId, name) => {
    const canonical = await assertContainedFile(root, path2);
    const file = await files.register(canonical, sessionId, name);
    try {
      await assertContainedFile(root, path2);
    } catch (error) {
      files.revoke(file.id, sessionId);
      throw error;
    }
    return file;
  };
  try {
    installSettingsSection(ctx, SETTINGS_NAMESPACE, SETTINGS_SCHEMA, DEFAULT_CONFIG, {
      setSource: (current) => {
        config = { ...DEFAULT_CONFIG, ...current };
      },
      onChange: () => {
      }
    });
  } catch (error) {
    console.warn("[dsh-drag-file] settings section unavailable, using defaults:", error);
  }
  ctx.inject(["webServer", "workspaceRegistry"], (webCtx) => {
    const registry = webCtx.workspaceRegistry;
    const register = (path2, description, handler) => {
      webCtx.effect(() => webCtx.webServer.register({ kind: "exact", path: path2, handler }), description);
    };
    const hostService = createSideChatExportRegistrar({
      files,
      registry,
      config: () => config,
      exportRoot: sideChatExportRoot()
    });
    webCtx.provide("dshDragFileHost", hostService);
    register(CONFIG_ROUTE3, "drag-file: config route", (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "Use GET" } });
      sendJson(res, 200, { ok: true, value: config });
    });
    register(SETTINGS_ROUTE3, "drag-file: settings route", async (req, res) => {
      if (req.method === "GET") return sendJson(res, 200, { ok: true, value: config });
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "Use GET or POST" } });
      try {
        const next = SETTINGS_SCHEMA({ ...config, ...await readJsonBody(req, 64 * 1024) });
        assertSafeRelativeDirectory(next.dropDir);
        config = next;
        try {
          const settings = ctx.get("settings");
          await settings?.replace?.(SETTINGS_NAMESPACE, { ...next });
        } catch (error) {
          console.warn("[dsh-drag-file] settings persist failed, keeping in-memory value:", error);
        }
        sendJson(res, 200, { ok: true, value: next });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: { code: "invalid-settings", message: safeError(error, "Invalid settings") } });
      }
    });
    register(RESOLVE_ROUTE3, "drag-file: resolve route", async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { status: "error", message: "method not allowed" });
      try {
        const request = await readJsonBody(req, 64 * 1024);
        let response;
        if (request.phase === "metadata") {
          if (!validDroppedFile(request.file)) throw new Error("invalid dropped file metadata");
          const current = workspaceForSession(registry, request.sessionId);
          if (current === void 0) throw new Error("unknown session workspace");
          const candidates = await metadataCandidates(request.file, current.path, registry.list().map((item) => item.path));
          if (candidates.length === 0) response = { status: "not-found" };
          else {
            pruneResolutions();
            const id = opaqueId2();
            resolutions.set(id, { file: request.file, sessionId: request.sessionId, candidates: candidates.map((item) => item.path), choices: /* @__PURE__ */ new Map(), stage: "sample", expiresAt: Date.now() + RESOLUTION_TTL_MS });
            response = { status: "sample-required", resolutionId: id };
          }
        } else if (request.phase === "sample" || request.phase === "full") {
          const entry = resolution(request.resolutionId);
          if (entry === void 0) throw new Error("invalid or expired resolution");
          if (entry.stage !== request.phase) throw new Error("invalid resolution phase");
          const matched = await matchingFileDigest(entry.candidates, request.digest, request.phase, entry.file);
          entry.candidates = matched;
          const decision = resolutionDecision(request.phase, entry.file.size, matched.length);
          if (decision === "not-found") {
            resolutions.delete(request.resolutionId);
            response = { status: "not-found" };
          } else if (decision === "found") {
            resolutions.delete(request.resolutionId);
            response = await found(matched[0], entry.sessionId, entry.file.name);
          } else if (decision === "full-required") {
            entry.stage = "full";
            response = { status: "full-required", resolutionId: request.resolutionId };
          } else if (decision === "choose") {
            entry.choices.clear();
            const choices = matched.map((path2, index) => {
              const id = opaqueId2();
              entry.choices.set(id, path2);
              return { id, label: `\u5019\u9009\u6587\u4EF6 ${index + 1}` };
            });
            entry.stage = "choose";
            response = { status: "choose", resolutionId: request.resolutionId, choices };
          } else throw new Error("invalid resolution decision");
        } else if (request.phase === "choose") {
          const entry = resolution(request.resolutionId);
          const path2 = entry?.choices.get(request.choiceId);
          if (entry === void 0 || entry.stage !== "choose" || path2 === void 0) throw new Error("invalid or expired choice");
          resolutions.delete(request.resolutionId);
          response = await found(path2, entry.sessionId, entry.file.name);
        } else throw new Error("invalid resolve phase");
        sendJson(res, 200, response);
      } catch (error) {
        sendJson(res, 400, { status: "error", message: safeError(error, "File resolution failed") });
      }
    });
    register(COPY_ROUTE3, "drag-file: copy route", async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "Use POST" } });
      try {
        const body = await readJsonBody(req);
        if (typeof body.dataBase64 !== "string" || body.dataBase64.length === 0) throw new Error("Missing dataBase64");
        const bytes = Buffer2.from(body.dataBase64, "base64");
        if (bytes.length === 0 || bytes.length > MAX_COPY_BYTES) return sendJson(res, 413, { ok: false, error: { code: "too-large", message: "File is too large" } });
        const workspace = workspaceForSession(registry, body.sessionId);
        if (workspace === void 0) throw new Error("unknown session workspace");
        const copied = await copyBytesToDropDir(workspace.path, config.dropDir, body.name, bytes);
        const file = await registerContained(copied.path, workspace.path, String(body.sessionId), safeName(body.name));
        sendJson(res, 200, { ok: true, value: file });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: { code: "copy-failed", message: safeError(error, "File copy failed") } });
      }
    });
    register(PREVIEW_ROUTE3, "drag-file: preview route", async (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "Use GET or HEAD" } });
      const sessionId = querySessionId(req);
      const verified = workspaceForSession(registry, sessionId) === void 0 ? void 0 : await files.openVerified(queryId(req), sessionId);
      if (verified === void 0) return sendJson(res, 404, { ok: false, error: { code: "not-found", message: "Attachment is unavailable or expired" } });
      if (!["pdf", "video", "audio"].includes(verified.entry.previewKind)) {
        await verified.handle.close();
        return sendJson(res, 415, { ok: false, error: { code: "not-previewable", message: "This file type is not available for inline preview" } });
      }
      await streamRegisteredFile(res, verified.entry, req.headers.range, req.method === "HEAD", verified.handle);
    });
    register(TEXT_PREVIEW_ROUTE3, "drag-file: text preview route", async (req, res) => {
      if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "Use GET" } });
      const sessionId = querySessionId(req);
      const verified = workspaceForSession(registry, sessionId) === void 0 ? void 0 : await files.openVerified(queryId(req), sessionId);
      if (verified === void 0) return sendJson(res, 404, { ok: false, error: { code: "not-found", message: "Attachment is unavailable or expired" } });
      const { entry, handle } = verified;
      if (entry.previewKind !== "text") {
        await handle.close();
        return sendJson(res, 415, { ok: false, error: { code: "not-previewable", message: "This file is not a text preview" } });
      }
      if (entry.size > MAX_TEXT_FILE_BYTES3) {
        await handle.close();
        return sendJson(res, 413, { ok: false, error: { code: "too-large", message: "This text file is too large to preview safely" } });
      }
      try {
        const buffer = Buffer2.alloc(Math.min(entry.size, TEXT_READ_BYTES3));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        const body = buffer.subarray(0, bytesRead);
        res.writeHead(200, textPreviewHeaders(entry, body.length, entry.size > TEXT_READ_BYTES3));
        res.end(body);
      } finally {
        await handle.close();
      }
    });
    register(OPEN_ROUTE3, "drag-file: system open route", async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "Use POST" } });
      try {
        const body = await readJsonBody(req, 16 * 1024);
        const verified = workspaceForSession(registry, body.sessionId) === void 0 ? void 0 : await files.openVerified(body.id, body.sessionId);
        if (verified === void 0) return sendJson(res, 404, { ok: false, error: { code: "not-found", message: "Attachment is unavailable or expired" } });
        await verified.handle.close();
        await openWithSystem(verified.entry.path);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 500, { ok: false, error: { code: "open-failed", message: safeError(error, "The system application could not open this file") } });
      }
    });
    register(REVOKE_ROUTE3, "drag-file: revoke route", async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "Use POST" } });
      try {
        const body = await readJsonBody(req, 16 * 1024);
        if (!Array.isArray(body.ids) || body.ids.length > 256) throw new Error("invalid token list");
        if (workspaceForSession(registry, body.sessionId) === void 0) throw new Error("unknown session workspace");
        for (const id of body.ids) files.revoke(id, body.sessionId);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: { code: "invalid-request", message: safeError(error, "Invalid revoke request") } });
      }
    });
    webCtx.effect(() => () => {
      files.clear();
      resolutions.clear();
    }, "drag-file: clear temporary registries");
  });
}
var index_default = apply;
export {
  FileTokenRegistry,
  SETTINGS_NAMESPACE,
  apply,
  assertContainedFile,
  assertSafeRelativeDirectory,
  classifyFile,
  index_default as default,
  ensureContainedDirectory,
  inlineDisposition,
  parseSingleRange,
  resolutionDecision,
  systemOpenCommand,
  workspacePathForSession
};
