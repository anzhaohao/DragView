// src/fingerprint.ts
import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";

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
  const size = (await stat(path)).size;
  const handle = await open(path, "r");
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
export {
  fullFingerprint,
  sampleFingerprint
};
