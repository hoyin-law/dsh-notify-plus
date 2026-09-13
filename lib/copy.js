/**
 * Notification copy for every locale this plugin ships.
 *
 * DSH Desktop reports `desktopRuntime.locale` as a short language tag. Only the
 * primary subtag is honoured, and anything unknown falls back to English so a
 * notification always renders real text instead of a raw key.
 *
 * @module dsh-notify-plus/copy
 */

/** Supported locale subtags, in preference order. */
export const SUPPORTED_LOCALES = Object.freeze(["zh", "en"]);

const COPY = Object.freeze({
  en: Object.freeze({
    turnCompletedBody: "Finished. Open DSH Desktop to review the result.",
    turnFailedBody: "Could not finish. Open DSH Desktop for details.",
    turnFailedReason: (reason) => `Could not finish: ${reason}`,
    turnFailedReasonMaxTokens: (reason) => `Ran out of context: ${reason}`,
    jobCompletedTitle: "Background Job Completed",
    jobFailedTitle: "Background Job Failed",
    jobCompletedBody: (label) => (label === "" ? "A background job finished." : `${label} finished.`),
    jobFailedBody: (label) => (label === "" ? "A background job could not finish." : `${label} could not finish.`),
    toolFallback: (count) => `Finished ${count} tool calls. Open DSH Desktop for details.`,
  }),
  zh: Object.freeze({
    turnCompletedBody: "已完成，打开 DSH Desktop 查看结果。",
    turnFailedBody: "未能完成，请打开 DSH Desktop 查看详情。",
    turnFailedReason: (reason) => `未能完成：${reason}`,
    turnFailedReasonMaxTokens: (reason) => `上下文用尽：${reason}`,
    jobCompletedTitle: "后台任务已完成",
    jobFailedTitle: "后台任务失败",
    jobCompletedBody: (label) => (label === "" ? "有一个后台任务已结束。" : `「${label}」已结束。`),
    jobFailedBody: (label) => (label === "" ? "一个后台任务未能完成。" : `「${label}」未能完成。`),
    toolFallback: (count) => `已完成 ${count} 项工具调用，打开 DSH Desktop 查看详情。`,
  }),
});

/**
 * Normalize an arbitrary locale tag to a supported subtag.
 *
 * @param locale - tag such as `zh-CN`, `en_US`, or `undefined`.
 * @returns `zh` or `en`.
 */
export function resolveLocale(locale) {
  if (typeof locale !== "string") return "en";
  const primary = locale.trim().toLowerCase().split(/[-_]/u)[0];
  return SUPPORTED_LOCALES.includes(primary) ? primary : "en";
}

/** Return the copy table for one locale. */
export function copyFor(locale) {
  return COPY[resolveLocale(locale)];
}

/**
 * Clip a derived label so one long job command cannot fill the toast.
 *
 * @param label - raw label text.
 * @param max - maximum code points to keep.
 * @returns single-line trimmed label.
 */
export function normalizeLabel(label, max = 48) {
  if (typeof label !== "string") return "";
  const collapsed = label.replace(/\s+/gu, " ").trim();
  const characters = [...collapsed];
  if (characters.length <= max) return collapsed;
  return `${characters.slice(0, max).join("").trimEnd()}…`;
}

/**
 * Build the turn-completion notification.
 *
 * The title is always the live conversation title, which is the whole point of
 * this plugin: the reader can tell *which* conversation finished.
 *
 * @param options - locale, conversation title, and distilled body.
 * @returns a `{ title, body }` pair ready for the desktop runtime.
 */
export function turnCompletedCopy({ locale, title, body }) {
  const copy = copyFor(locale);
  return {
    title,
    body: body === "" ? copy.turnCompletedBody : body,
  };
}

/**
 * Build the turn-failure notification.
 *
 * @param options - locale, conversation title, failure reason, and reason kind.
 * @returns a `{ title, body }` pair ready for the desktop runtime.
 */
export function turnFailedCopy({ locale, title, reason, kind }) {
  const copy = copyFor(locale);
  if (kind === "max-tokens") {
    return { title, body: copy.turnFailedReasonMaxTokens(reason === "" ? copy.turnFailedBody : reason) };
  }
  return { title, body: reason === "" ? copy.turnFailedBody : copy.turnFailedReason(reason) };
}

/**
 * Build a completion body for a turn that produced tool work but no prose.
 *
 * @param locale - desktop locale tag.
 * @param count - number of tool calls recorded in the turn.
 * @returns the localized fallback line, or an empty string when there is no
 *   tool work to report.
 */
export function toolFallbackCopy(locale, count) {
  if (!Number.isFinite(count) || count <= 0) return "";
  return copyFor(locale).toolFallback(Math.floor(count));
}

/**
 * Build a background-job notification.
 *
 * Unlike turns, a job has its own descriptive label, so the label carries the
 * specificity and the localized sentence carries the outcome.
 *
 * @param options - locale, job status, and job label.
 * @returns a `{ title, body }` pair ready for the desktop runtime.
 */
export function jobCopy({ locale, status, label }) {
  const copy = copyFor(locale);
  const normalized = normalizeLabel(label);
  if (status === "failed") {
    return { title: copy.jobFailedTitle, body: copy.jobFailedBody(normalized) };
  }
  return { title: copy.jobCompletedTitle, body: copy.jobCompletedBody(normalized) };
}
