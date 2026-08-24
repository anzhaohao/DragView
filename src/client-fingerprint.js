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

// src/client/fingerprint.ts
function droppedFileMeta(file) {
  return { kind: "file", name: file.name, size: file.size, lastModified: file.lastModified };
}
function sampleRanges(size) {
  if (!Number.isSafeInteger(size) || size < 0) throw new TypeError("size must be a non-negative safe integer");
  if (size <= SAMPLE_BYTES * 3) return [{ start: 0, length: size }];
  return [
    0,
    Math.max(0, Math.floor(size / 2) - Math.floor(SAMPLE_BYTES / 2)),
    size - SAMPLE_BYTES
  ].map((start) => ({ start, length: Math.min(SAMPLE_BYTES, size - start) }));
}
async function hashFromFile(file, size, ranges) {
  const parts = [];
  for (const range of ranges) {
    parts.push(new Uint8Array(await file.slice(range.start, range.start + range.length).arrayBuffer()));
  }
  const header = new Uint8Array(8);
  new DataView(header.buffer).setBigUint64(0, BigInt(size), false);
  const total = header.length + parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  joined.set(header, 0);
  let offset = header.length;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  const digest = await crypto.subtle.digest("SHA-256", joined);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function sampleFingerprint(file) {
  return hashFromFile(file, file.size, sampleRanges(file.size));
}
async function fullFingerprint(file) {
  return hashFromFile(file, file.size, [{ start: 0, length: file.size }]);
}
export {
  droppedFileMeta,
  fullFingerprint,
  sampleFingerprint
};
