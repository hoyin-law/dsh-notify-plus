/**
 * Read Windows toast notifications out of the shell's own history database.
 *
 * This is the only way to verify notification *output* without watching the
 * screen: DSH Desktop raises toasts through Electron's `Notification`, which
 * leaves no application log line, and `notifyAttention` returns early while the
 * window is focused, so a focused test can appear to do nothing.
 *
 * Windows records every delivered toast in
 * `%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db`. This script
 * copies that database (plus its WAL sidecar, since the shell keeps it open) to
 * a temp directory and reads it read-only, so the live shell is never touched.
 *
 * Usage:
 *   node tools/read-windows-toasts.mjs                # newest 25 toasts
 *   node tools/read-windows-toasts.mjs --limit 50
 *   node tools/read-windows-toasts.mjs --since 2026-09-13T20:24:33Z
 *
 * Only meaningful on Windows. `node:sqlite` requires Node >= 22.5.
 */

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SOURCE_DIR = join(process.env.LOCALAPPDATA ?? "", "Microsoft", "Windows", "Notifications");
const DB_NAME = "wpndatabase.db";

/** Parse `--limit <n>` and `--since <iso>`. */
function parseArgs(argv) {
  const options = { limit: 25, since: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--limit") options.limit = Number(argv[++index]);
    else if (argv[index] === "--since") options.since = Date.parse(argv[++index]);
    else throw new Error(`unknown argument ${JSON.stringify(argv[index])}`);
  }
  if (!Number.isSafeInteger(options.limit) || options.limit <= 0) throw new Error("--limit must be a positive integer");
  return options;
}

/** Windows stores FILETIME-style 100ns ticks since 1601-01-01 UTC. */
function filetimeToMillis(value) {
  return Number(value / 10000n) - 11644473600000;
}

/** Pull every `<text>` node out of one toast payload. */
function toastTexts(payload) {
  if (payload === null || payload === undefined) return [];
  const utf8 = typeof payload === "string" ? payload : Buffer.from(payload).toString("utf8");
  const fromUtf8 = [...utf8.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gu)].map((match) => match[1]);
  if (fromUtf8.length > 0) return fromUtf8;
  const utf16 = Buffer.from(payload).toString("utf16le");
  return [...utf16.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gu)].map((match) => match[1]);
}

function main() {
  const { limit, since } = parseArgs(process.argv.slice(2));

  const work = mkdtempSync(join(tmpdir(), "dsh-toasts-"));
  try {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        copyFileSync(join(SOURCE_DIR, `${DB_NAME}${suffix}`), join(work, `${DB_NAME}${suffix}`));
      } catch {
        /* A missing sidecar (or a clean shutdown with no WAL) is expected. */
      }
    }

    const database = new DatabaseSync(join(work, DB_NAME), { readOnly: true, readBigInts: true });
    const rows = database
      .prepare('SELECT Payload, ArrivalTime FROM Notification ORDER BY ArrivalTime DESC LIMIT ?')
      .all(limit);
    database.close();

    let shown = 0;
    for (const row of rows) {
      const millis = filetimeToMillis(row.ArrivalTime);
      if (since !== undefined && !Number.isNaN(since) && millis < since) continue;
      const texts = toastTexts(row.Payload);
      if (texts.length === 0) continue;
      shown += 1;
      const local = new Date(millis).toLocaleString();
      const [title = "", ...body] = texts;
      console.log(`${local}  title=${JSON.stringify(title)}  body=${JSON.stringify(body.join(" "))}`);
    }
    console.log(`\n${shown} toast(s) with text.`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
