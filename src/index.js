// src/index.ts
import { Buffer as Buffer2 } from "node:buffer";
import { isAbsolute as isAbsolute2 } from "node:path";
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

// src/locator.ts
import { homedir as homedir2 } from "node:os";
import { basename, join as join2, normalize, resolve, sep } from "node:path";
import { readdir as readdir2, stat } from "node:fs/promises";

// src/fingerprint.ts
import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

// src/protocol.ts
var FILE_DROP_ROUTE = "/file-drop";
var RESOLVE_ROUTE = `${FILE_DROP_ROUTE}/resolve`;
var COPY_ROUTE = `${FILE_DROP_ROUTE}/copy`;
var CONFIG_ROUTE = `${FILE_DROP_ROUTE}/config`;
var SETTINGS_ROUTE = `${FILE_DROP_ROUTE}/settings`;
var SAMPLE_BYTES = 64 * 1024;
var SMALL_FILE_BYTES = 8 * 1024 * 1024;

// src/fingerprint.ts
function sampleRanges(size) {
  if (!Number.isSafeInteger(size) || size < 0) throw new TypeError("size must be a non-negative safe integer");
  if (size <= SAMPLE_BYTES * 3) return [{ start: 0, length: size }];
  return [
    0,
    Math.max(0, Math.floor(size / 2) - Math.floor(SAMPLE_BYTES / 2)),
    size - SAMPLE_BYTES
  ].map((start) => ({ start, length: Math.min(SAMPLE_BYTES, size - start) }));
}
function hashParts(size, parts) {
  const hash = createHash("sha256");
  const header = Buffer.allocUnsafe(8);
  header.writeBigUInt64BE(BigInt(size));
  hash.update(header);
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}
async function sampleFingerprint(path, size) {
  const handle = await open(path, "r");
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
async function fullFingerprint(path) {
  const handle = await open(path, "r");
  try {
    const hash = createHash("sha256");
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
    return new Promise((resolve2, reject) => {
      execFile(command, [...args], {
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        encoding: "buffer"
      }, (error, stdout) => {
        if (error) reject(error);
        else resolve2(stdout);
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
      return paths.filter((path) => path.split("/").at(-1) === name).slice(0, PLATFORM_MAX_CANDIDATES);
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
  const path = join2(root, name);
  try {
    const info = await stat(path);
    return info.isFile() ? path : void 0;
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
      const path = join2(directory, entry.name);
      if (entry.name === name && entry.isFile()) found.push(path);
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(path, remaining - 1);
    }
  };
  await visit(root, depth);
  return found;
}
async function validateCandidates(item, paths) {
  const candidates = [];
  for (const path of [...new Set(paths)].slice(0, MAX_CANDIDATES)) {
    try {
      const info = await stat(path);
      if (info.isFile() && info.size === item.size && basename(path) === item.name) {
        candidates.push({ path: normalize(path), mtimeMs: info.mtimeMs });
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
  const canonicalRoots = roots.map((root) => resolve(root));
  return paths.filter((path) => {
    const candidate = resolve(path);
    return canonicalRoots.some((root) => candidate === root || candidate.startsWith(`${root}${sep}`));
  });
}
async function metadataCandidates(item, request) {
  const current = request.currentWorkspacePath;
  const workspaceRoots = [...new Set(request.workspacePaths ?? [])].filter((root) => typeof root === "string" && root !== "");
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
  for (const path of candidates.slice(0, MAX_CANDIDATES)) {
    try {
      const actual = phase === "sample" ? await sampleFingerprint(path, file.size) : await fullFingerprint(path);
      if (actual === digest) matched.push(path);
    } catch {
    }
  }
  return matched;
}
async function locate(request) {
  const file = request.file;
  if (file.name === "") return { status: "error", message: "invalid dropped file metadata" };
  if (!Number.isSafeInteger(file.size) || file.size < 0) return { status: "error", message: "invalid dropped-file metadata" };
  if (request.phase === "metadata") {
    const candidates = await metadataCandidates(file, request);
    if (candidates.length === 0) return { status: "not-found" };
    if (candidates.length === 1) return { status: "found", path: candidates[0].path };
    return { status: "sample-required", candidates: candidates.map((candidate) => candidate.path) };
  }
  if (request.phase !== "sample" && request.phase !== "full" || request.digest === void 0 || request.candidates === void 0) {
    return { status: "error", message: "digest phase requires candidates and digest" };
  }
  const matched = await matchingFileDigest(request.candidates, request.digest, request.phase, file);
  if (matched.length === 0) return { status: "not-found" };
  if (matched.length === 1) return { status: "found", path: matched[0] };
  if (request.phase === "sample" && file.size <= SMALL_FILE_BYTES) return { status: "choose", candidates: matched };
  if (request.phase === "sample") return { status: "full-required", candidates: matched };
  return { status: "choose", candidates: matched };
}

// src/copy.ts
import { mkdir, writeFile } from "node:fs/promises";
import { basename as basename2, isAbsolute, join as join3 } from "node:path";
import { homedir as homedir3 } from "node:os";
var MAX_COPY_BYTES = 100 * 1024 * 1024;
function safeName(raw) {
  const base = basename2(String(raw ?? "")).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 120);
  return base.length === 0 ? "file" : base;
}
async function copyBytesToDropDir(root, dropDir, rawName, bytes) {
  if (!isAbsolute(root)) throw new Error(`workspace root must be absolute, got "${root}"`);
  const safe = safeName(rawName);
  const dir = join3(root, dropDir);
  await mkdir(dir, { recursive: true });
  const target = join3(dir, `${Date.now()}-${safe}`);
  await writeFile(target, bytes);
  return { path: target, filename: basename2(target) };
}
async function fallbackWorkspaceRoot(registryList) {
  if (registryList) {
    const roots = registryList();
    const first = roots.find((root) => typeof root?.path === "string" && isAbsolute(root.path));
    if (first) return first.path;
  }
  const home = process.env.DSH_HOME || join3(homedir3(), ".dsh");
  throw new Error(`no workspace available (checked registry and ${home})`);
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
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(body));
}
function apply(ctx) {
  let config = { ...DEFAULT_CONFIG };
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
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: CONFIG_ROUTE,
      handler: async (req, res) => {
        if (req.method !== "GET") {
          sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "Use GET" } });
          return;
        }
        sendJson(res, 200, { ok: true, value: config });
      }
    }), "drag-file: config route");
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: SETTINGS_ROUTE,
      handler: async (req, res) => {
        if (req.method === "GET") {
          sendJson(res, 200, { ok: true, value: config });
          return;
        }
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "Use GET or POST" } });
          return;
        }
        try {
          const body = await readJsonBody(req, 64 * 1024);
          const next = { ...config, ...body };
          const validated = SETTINGS_SCHEMA(next);
          config = validated;
          try {
            const settings = ctx.get("settings");
            await settings?.replace?.(SETTINGS_NAMESPACE, { ...validated });
          } catch (error) {
            console.warn("[dsh-drag-file] settings persist failed, keeping in-memory value:", error);
          }
          sendJson(res, 200, { ok: true, value: validated });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendJson(res, 400, { ok: false, error: { code: "invalid-settings", message } });
        }
      }
    }), "drag-file: settings route");
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: RESOLVE_ROUTE,
      handler: async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { status: "error", message: "method not allowed" });
          return;
        }
        try {
          const request = await readJsonBody(req, 64 * 1024);
          sendJson(res, 200, await locate(request));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendJson(res, 400, { status: "error", message });
        }
      }
    }), "drag-file: resolve route");
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: COPY_ROUTE,
      handler: async (req, res) => {
        const respond = (value, status = 200) => sendJson(res, status, value);
        try {
          if (req.method !== "POST") {
            respond({ ok: false, error: { code: "method-not-allowed", message: "Use POST" } }, 405);
            return;
          }
          let body;
          try {
            body = await readJsonBody(req);
          } catch (error) {
            respond({ ok: false, error: { code: "invalid-request", message: error instanceof Error ? error.message : String(error) } }, 400);
            return;
          }
          const { name, dataBase64, workspace } = body;
          if (typeof dataBase64 !== "string" || dataBase64.length === 0) {
            respond({ ok: false, error: { code: "invalid-request", message: "Missing dataBase64" } }, 400);
            return;
          }
          const bytes = Buffer2.from(dataBase64, "base64");
          if (bytes.length === 0 || bytes.length > MAX_COPY_BYTES) {
            respond({ ok: false, error: { code: "too-large", message: `File exceeds ${Math.floor(MAX_COPY_BYTES / 1024 / 1024)}MB` } }, 413);
            return;
          }
          const isAbs = typeof workspace === "string" && workspace.length > 0 && isAbsolute2(workspace);
          const root = isAbs ? workspace : await fallbackWorkspaceRoot(() => {
            const registry = ctx.get("workspaceRegistry");
            return registry?.list ? registry.list() : [];
          });
          const { path, filename } = await copyBytesToDropDir(root, config.dropDir, name, bytes);
          respond({ ok: true, value: { path, filename, bytes: bytes.length, dropDir: config.dropDir } });
        } catch (error) {
          respond({ ok: false, error: { code: "copy-failed", message: error instanceof Error ? error.message : String(error) } }, 500);
        }
      }
    }), "drag-file: copy route");
  });
}
var index_default = apply;
export {
  SETTINGS_NAMESPACE,
  apply,
  index_default as default
};
