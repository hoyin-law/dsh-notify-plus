/**
 * Turn and job observation: pure projections from session events to
 * notification payloads.
 *
 * Nothing here knows about Cordis. Every function takes the services it needs
 * as arguments, which keeps the behaviour unit-testable without a harness
 * runtime and keeps `index.js` limited to wiring.
 *
 * @module dsh-notify-plus/turn
 */

import { jobCopy, toolFallbackCopy, turnCompletedCopy, turnFailedCopy } from "./copy.js";
import { countToolCalls, describeTurnFailure, isSubagentSession, sessionDisplayTitle, textOfMessage } from "./session.js";
import { charCount, summarize, summarizeFailure } from "./summarize.js";

/** A distilled line shorter than this is treated as too thin to inform. */
export const INFORMATIVE_MIN_CHARS = 8;

/**
 * Create the per-turn accumulator for one conversation.
 *
 * @param turn - the turn identifier carried by `turn/start`.
 * @returns a fresh accumulator.
 */
export function createTurnState(turn) {
  return { turn, userInitiated: false, texts: [], toolCalls: 0 };
}

/**
 * Pick the most informative assistant line produced during a turn.
 *
 * The final assistant message is the usual answer, but a closing "Done." is not
 * worth a toast, so earlier messages are considered when the newest one
 * distils to something too thin.
 *
 * @param texts - assistant text blocks collected in order.
 * @returns the chosen summary, or an empty string when nothing is usable.
 */
export function distillTurn(texts) {
  let fallback = "";
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const summary = summarize(texts[index]);
    if (summary === "") continue;
    if (charCount(summary) >= INFORMATIVE_MIN_CHARS) return summary;
    if (fallback === "") fallback = summary;
  }
  return fallback;
}

/**
 * Resolve the optional title service without letting a lifecycle race become a
 * notification failure.
 *
 * @param ctx - any context exposing `get`.
 * @returns the `sessionTitle` service, or `undefined`.
 */
function resolveTitleService(ctx) {
  try {
    return ctx?.get?.("sessionTitle");
  } catch {
    return undefined;
  }
}

/** Whether a runtime can actually raise a native notification. */
function canNotify(runtime) {
  return runtime !== undefined && typeof runtime.notifyAttention === "function";
}

/**
 * Emit the completion notification for one finished user-initiated turn.
 *
 * @param ctx - context used to read the title service.
 * @param runtime - the desktop runtime service.
 * @param session - the live session the turn belongs to.
 * @param turnState - the accumulator for the finished turn.
 */
function notifyTurnCompleted(ctx, runtime, session, turnState) {
  let body = distillTurn(turnState.texts);
  if (body === "") body = toolFallbackCopy(runtime.locale, turnState.toolCalls);
  runtime.notifyAttention(
    turnCompletedCopy({
      locale: runtime.locale,
      title: sessionDisplayTitle(resolveTitleService(ctx), session),
      body,
    }),
  );
}

/**
 * Handle one appended session event.
 *
 * @param ctx - context used to read the title service.
 * @param sessionsCtx - context exposing `desktopRuntime`.
 * @param readSettings - thunk returning the current settings snapshot.
 * @param openTurns - per-session turn accumulators, keyed by session id.
 * @param session - the emitting session.
 * @param event - the appended session event.
 */
export function handleSessionEvent(ctx, sessionsCtx, readSettings, openTurns, session, event) {
  const settings = readSettings();
  if (settings === undefined || settings.enabled !== true) return;
  if (isSubagentSession(session)) return;

  const sessionId = String(session?.header?.id ?? session?.id ?? "");
  if (sessionId === "") return;

  if (event?.type === "turn/start") {
    openTurns.set(sessionId, createTurnState(event.data?.turn));
    return;
  }

  const turnState = openTurns.get(sessionId);
  if (turnState === undefined) return;

  if (event.type === "user/message") {
    if (event.data?.source?.kind === "user") turnState.userInitiated = true;
    return;
  }

  if (event.type === "assistant/message") {
    if (event.data?.turn !== turnState.turn) return;
    const message = event.data?.message;
    const text = textOfMessage(message);
    if (text !== "") turnState.texts.push(text);
    turnState.toolCalls += countToolCalls(message);
    return;
  }

  if (event.type !== "turn/end") return;
  if (event.data?.turn !== turnState.turn) return;
  openTurns.delete(sessionId);
  if (!turnState.userInitiated) return;

  const runtime = sessionsCtx?.desktopRuntime;
  if (!canNotify(runtime)) return;

  const reason = event.data?.reason ?? {};
  if (reason.kind === "completed") {
    if (settings.notifyOnTurnCompletion !== true) return;
    notifyTurnCompleted(ctx, runtime, session, turnState);
    return;
  }
  if (reason.kind !== "error" && reason.kind !== "max-tokens") return;
  if (settings.notifyOnTurnFailure !== true) return;

  const failure = describeTurnFailure(reason);
  runtime.notifyAttention(
    turnFailedCopy({
      locale: runtime.locale,
      title: sessionDisplayTitle(resolveTitleService(ctx), session),
      reason: summarizeFailure(failure.detail),
      kind: failure.kind,
    }),
  );
}

/**
 * Notify on one settled background job.
 *
 * @param runtime - the desktop runtime service.
 * @param readSettings - thunk returning the current settings snapshot.
 * @param snapshot - the terminal job snapshot.
 */
export function notifyJobSettled(runtime, readSettings, snapshot) {
  const settings = readSettings();
  if (settings === undefined || settings.enabled !== true) return;
  const status = snapshot?.status;
  if (status === "completed") {
    if (settings.notifyOnJobCompletion !== true) return;
  } else if (status === "failed") {
    if (settings.notifyOnJobFailure !== true) return;
  } else return;
  if (!canNotify(runtime)) return;
  runtime.notifyAttention(jobCopy({ locale: runtime.locale, status, label: snapshot.label }));
}
