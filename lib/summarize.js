/**
 * Deterministic one-line distillation of an assistant reply.
 *
 * The goal is a native-notification line a reader can act on without opening
 * the app: for CJK scripts 10-20 characters, for Latin scripts a short
 * sentence within the Windows toast body envelope. Everything here is pure and
 * dependency-free so it can be unit-tested without a harness runtime; no model
 * call is involved, so a notification never costs tokens or latency.
 *
 * @module dsh-notify-plus/summarize
 */

/** Sentence terminators shared by the wide and Latin scripts. */
const SENTENCE_SPLIT =
  /(?<=[。！？…；!?;])\s*|(?<=[.!?])\s+(?=[A-Z"'([{])|\n+/u;

/** Markdown constructs that never belong in a notification line. */
const FENCED_CODE = /(?:^|\n)\s*(?:```|~~~)[^\n]*\n[\s\S]*?(?:```|~~~)[^\n]*/gu;
const INLINE_CODE = /`([^`\n]*)`/gu;
const IMAGE = /!\[([^\]\n]*)\]\([^)\n]*\)/gu;
const LINK = /\[([^\]\n]*)\]\([^)\n]*\)/gu;
const AUTOLINK = /<https?:\/\/[^>\s]+>/gu;
const BARE_URL = /https?:\/\/[^\s<>()[\]"']+/gu;
const HTML_TAG = /<\/?[A-Za-z][^>\n]*>/gu;
const HEADING = /^[ \t]{0,3}#{1,6}[ \t]+/gmu;
const BLOCKQUOTE = /^[ \t]{0,3}>[ \t]?/gmu;
const LIST_MARKER = /^[ \t]{0,4}(?:[-*+]|\d{1,3}[.)])[ \t]+/gmu;
const TABLE_RULE = /^[ \t]*\|?[ \t:|-]*-[ \t:|-]*\|[ \t:|-]*$/gmu;
const EMPHASIS = /(\*\*|__|~~|\*|(?<=\s)_(?=\S)|\b_\b)/gu;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/gu;
const WHITESPACE = /[ \t\u00a0\u3000]+/gu;
const BLANK_LINES = /\n{2,}/gu;
const TRAILING_PUNCTUATION = /[\s，,、；;:：\-–—·]+$/u;

/** Wide-script ranges: CJK ideographs, kana, Hangul, fullwidth forms. */
const WIDE_SCRIPT = /[\u1100-\u11ff\u2e80-\u303f\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/gu;

/** Short acknowledgements that carry no task information on their own. */
const FILLER_OPENERS = new Set([
  "好",
  "好的",
  "好呀",
  "嗯",
  "嗯嗯",
  "是",
  "是的",
  "对",
  "对的",
  "当然",
  "没问题",
  "明白",
  "明白了",
  "收到",
  "了解",
  "ok",
  "okay",
  "oke",
  "sure",
  "yes",
  "yep",
  "yeah",
  "alright",
  "certainly",
  "got it",
  "understood",
  "no problem",
]);

/** Elision mark appended to a truncated line. */
export const ELLIPSIS = "…";

/**
 * Character budgets per script.
 *
 * `cjk` is the product requirement (10-20 characters). `latin` follows the
 * Windows toast envelope, where a body beyond roughly two lines is clipped by
 * the shell, so the summary stays well inside it.
 */
export const DEFAULT_LIMITS = Object.freeze({
  cjk: Object.freeze({ min: 10, max: 20 }),
  latin: Object.freeze({ min: 40, max: 140 }),
});

/** Count Unicode code points, so surrogate pairs are never split. */
export function charCount(text) {
  return text === undefined || text === null ? 0 : [...text].length;
}

/**
 * Classify the dominant script of a line.
 *
 * @param text - candidate text.
 * @returns `cjk` when wide characters dominate, otherwise `latin`.
 */
export function detectScript(text) {
  if (typeof text !== "string" || text.trim() === "") return "latin";
  const visible = [...text].filter((character) => !/\s/u.test(character)).length;
  if (visible === 0) return "latin";
  const wide = text.match(WIDE_SCRIPT)?.length ?? 0;
  return wide * 4 >= visible ? "cjk" : "latin";
}

/**
 * Reduce arbitrary reply markup to a single plain-text paragraph.
 *
 * @param raw - raw assistant text, possibly Markdown or HTML.
 * @returns plain single-line text, or an empty string when nothing survives.
 */
export function cleanText(raw) {
  if (typeof raw !== "string") return "";
  let text = raw;
  text = text.replace(FENCED_CODE, " ");
  text = text.replace(INLINE_CODE, "$1");
  text = text.replace(IMAGE, "$1");
  text = text.replace(LINK, "$1");
  text = text.replace(AUTOLINK, " ");
  text = text.replace(BARE_URL, " ");
  text = text.replace(HTML_TAG, " ");
  text = text.replace(TABLE_RULE, "\n");
  text = text.replace(HEADING, "");
  text = text.replace(BLOCKQUOTE, "");
  text = text.replace(LIST_MARKER, "");
  text = text.replace(EMPHASIS, "");
  text = text.replace(CONTROL, " ");
  text = text.replace(/[ \t]*\|[ \t]*/gu, " ");
  text = text.replace(WHITESPACE, " ");
  text = text.replace(BLANK_LINES, "\n");
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");
  return text.trim();
}

/**
 * Split cleaned text into sentences, keeping terminators attached.
 *
 * @param text - cleaned single-line text.
 * @returns non-empty trimmed sentences.
 */
export function splitSentences(text) {
  if (typeof text !== "string" || text === "") return [];
  return text
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
}

/**
 * Drop a leading acknowledgement clause such as `好的，` without touching a
 * clause that already names the work.
 *
 * @param sentence - first candidate sentence.
 * @returns the sentence with any filler opener removed.
 */
export function dropFillerOpener(sentence) {
  const match = /^([^，,、：:]{1,12})[，,、：:]\s*/u.exec(sentence);
  if (match === null) return sentence;
  if (!FILLER_OPENERS.has(match[1].trim().toLowerCase())) return sentence;
  const rest = sentence.slice(match[0].length).trim();
  return rest === "" ? sentence : rest;
}

/**
 * Join sentences until the minimum budget is met.
 *
 * @param sentences - ordered sentences.
 * @param limits - resolved `{ min, max }` character budget.
 * @returns the accumulated summary candidate.
 */
export function pickSentences(sentences, limits) {
  let out = "";
  for (const sentence of sentences) {
    if (out !== "" && charCount(out) >= limits.min) break;
    out = out === "" ? sentence : `${out} ${sentence}`;
    if (charCount(out) >= limits.max) break;
  }
  return out;
}

/**
 * Choose a cut point that prefers a real clause boundary over a hard slice.
 *
 * @param characters - code-point array that is about to be truncated.
 * @param limits - resolved `{ min, max }` character budget.
 * @returns the exclusive end index to keep.
 */
function findSoftCut(characters, limits) {
  const floor = Math.min(characters.length, Math.max(limits.min, Math.floor(limits.max * 0.5)));
  for (let index = characters.length - 1; index >= floor; index -= 1) {
    if (/[\s，,、；;。！？!?]/u.test(characters[index])) return index;
  }
  return characters.length;
}

/**
 * Trim a candidate to the character budget, marking any elision.
 *
 * @param text - candidate summary.
 * @param limits - resolved `{ min, max }` character budget.
 * @returns the budget-respecting line.
 */
export function truncate(text, limits) {
  const characters = [...text];
  if (characters.length <= limits.max) return text.replace(TRAILING_PUNCTUATION, "").trim();
  const window = characters.slice(0, limits.max);
  const cut = findSoftCut(window, limits);
  const head = window
    .slice(0, cut)
    .join("")
    .replace(TRAILING_PUNCTUATION, "")
    .trim();
  return head === "" ? window.join("").trim() : `${head}${ELLIPSIS}`;
}

/**
 * Resolve the character budget for one summary.
 *
 * @param script - `cjk` or `latin`.
 * @param options - optional `min`/`max` overrides.
 * @returns a validated `{ min, max }` budget.
 */
export function resolveLimits(script, options = {}) {
  const base = DEFAULT_LIMITS[script] ?? DEFAULT_LIMITS.latin;
  const min = Number.isFinite(options.min) && options.min > 0 ? Math.floor(options.min) : base.min;
  const max = Number.isFinite(options.max) && options.max > 0 ? Math.floor(options.max) : base.max;
  return { min: Math.min(min, max), max };
}

/**
 * Distil an assistant reply into one notification-sized line.
 *
 * @param raw - raw assistant text for the finished turn.
 * @param options - optional `min`/`max` character overrides.
 * @returns the distilled line, or an empty string when there is nothing usable.
 */
export function summarize(raw, options = {}) {
  const cleaned = cleanText(raw);
  if (cleaned === "") return "";
  const script = detectScript(cleaned);
  const limits = resolveLimits(script, options);
  const sentences = splitSentences(cleaned);
  if (sentences.length === 0) return truncate(cleaned, limits);
  const [first, ...rest] = sentences;
  const ordered = [dropFillerOpener(first), ...rest].filter((sentence) => sentence !== "");
  return truncate(pickSentences(ordered, limits), limits);
}

/**
 * Distil a failure reason into one notification-sized line.
 *
 * @param error - thrown value or reason payload reported by the session log.
 * @param options - optional `min`/`max` character overrides.
 * @returns the distilled line, or an empty string when nothing is usable.
 */
export function summarizeFailure(error, options = {}) {
  const message =
    typeof error === "string"
      ? error
      : typeof error?.message === "string"
        ? error.message
        : typeof error?.code === "string"
          ? error.code
          : "";
  return summarize(message, options);
}
