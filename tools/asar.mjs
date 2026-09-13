/**
 * Read files out of an Electron `.asar` archive.
 *
 * This repository depends on harness interfaces that are not a published
 * contract (`desktopRuntime.notifyAttention`, `session/event` payloads,
 * `ctx.get("sessionTitle")`, `jobs.onJobDone`). The wiring is pinned to the
 * exact shapes shipped inside `app.asar`, and this helper is how those shapes
 * were read, so a future contributor can re-derive them from a new DSH Desktop
 * build instead of trusting this repository's summary.
 *
 * Usage:
 *   node tools/asar.mjs <archive.asar> <inner/path>            # print a file
 *   node tools/asar.mjs <archive.asar> <inner/path> <outFile>  # write a file
 *   node tools/asar.mjs <archive.asar> <inner/dir>             # list a directory
 *
 * Example:
 *   node tools/asar.mjs "C:\Program Files\DSH Desktop\resources\app.asar" `
 *     node_modules/@deepseek-ai/dsh-session-title/README.zh.md docs.txt
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Fixed-size pickle preamble before the JSON header: four uint32 fields. */
const HEADER_PREAMBLE_BYTES = 16;

/**
 * Read an asar archive's JSON header.
 *
 * The pickle stores the JSON string length at offset 12 and the whole header
 * size at offset 4; file offsets are relative to `8 + headerSize`, not to the
 * unpadded end of the JSON string. Using the string length instead lands one
 * byte early whenever the JSON length is odd, which silently shifts every
 * extracted file.
 *
 * @param archive - archive bytes.
 * @returns the parsed header and the byte offset where file data begins.
 */
function readHeader(archive) {
  const headerSize = archive.readUInt32LE(4);
  const jsonSize = archive.readUInt32LE(12);
  const header = JSON.parse(
    archive.subarray(HEADER_PREAMBLE_BYTES, HEADER_PREAMBLE_BYTES + jsonSize).toString("utf8"),
  );
  return { header, dataStart: 8 + headerSize };
}

/**
 * Walk to one entry, tolerating a leading or trailing slash.
 *
 * @param header - parsed archive header.
 * @param innerPath - slash-separated path inside the archive.
 * @returns the entry, or `undefined`.
 */
function lookup(header, innerPath) {
  let entry = header;
  for (const segment of innerPath.split("/")) {
    if (segment === "" || segment === ".") continue;
    entry = entry.files?.[segment];
    if (entry === undefined) return undefined;
  }
  return entry;
}

/** Recursively print every file under a directory entry. */
function list(entry, prefix) {
  for (const [name, child] of Object.entries(entry.files ?? {})) {
    if (child.files === undefined) console.log(`${prefix}${name}\t${child.size}`);
    else list(child, `${prefix}${name}/`);
  }
}

const [archivePath, innerPath, outPath] = process.argv.slice(2);
if (archivePath === undefined || innerPath === undefined) {
  console.error("usage: node tools/asar.mjs <archive.asar> <inner/path> [outFile]");
  process.exit(2);
}

const archive = readFileSync(archivePath);
const { header, dataStart } = readHeader(archive);
const entry = lookup(header, innerPath);
if (entry === undefined) {
  console.error(`not found in archive: ${innerPath}`);
  process.exit(2);
}

if (entry.files !== undefined) {
  list(entry, `${innerPath.replace(/\/+$/u, "")}/`);
  process.exit(0);
}

const start = dataStart + Number(entry.offset);
const bytes = archive.subarray(start, start + Number(entry.size));
if (outPath === undefined) {
  process.stdout.write(bytes);
} else {
  const target = resolve(outPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  console.error(`wrote ${target}`);
}
