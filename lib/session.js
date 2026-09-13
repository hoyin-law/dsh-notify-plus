/**
 * Read-only projections over DSH session values.
 *
 * These helpers never mutate the session, its header, or its events, so they
 * are safe to call from a `session/event` listener where the appended event is
 * already frozen.
 *
 * @module dsh-notify-plus/session
 */

/**
 * Concatenate the human-readable text blocks of one message.
 *
 * Assistant messages hold a heterogeneous block list: text, reasoning,
 * tool calls, images, and provider-specific extras. Only `text` blocks are
 * eligible for a notification line.
 *
 * @param message - a `UserMessage` or `AssistantMessage`, or anything else.
 * @returns newline-joined text, or an empty string.
 */
export function textOfMessage(message) {
  const blocks = message?.content;
  if (!Array.isArray(blocks)) return "";
  const parts = [];
  for (const block of blocks) {
    if (block?.type === "text" && typeof block.text === "string" && block.text.trim() !== "") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}

/**
 * Count the tool calls requested by one assistant message.
 *
 * @param message - a candidate assistant message.
 * @returns the number of `tool-call` blocks.
 */
export function countToolCalls(message) {
  const blocks = message?.content;
  if (!Array.isArray(blocks)) return 0;
  let total = 0;
  for (const block of blocks) if (block?.type === "tool-call") total += 1;
  return total;
}

/**
 * Resolve the title to show for one conversation.
 *
 * Preference order mirrors the product UI: the durable session title, then the
 * workspace directory name, then the raw session id. The title service is
 * probed lazily because a plugin row can mount in any order relative to it.
 *
 * @param titles - the optional `sessionTitle` service.
 * @param session - the live session the event belongs to.
 * @returns a non-empty display title.
 */
export function sessionDisplayTitle(titles, session) {
  let snapshot;
  try {
    snapshot = titles?.get?.(session);
  } catch {
    /* A title service that rejects a detached or foreign session is not a
       reason to drop the notification; fall through to the display fallbacks. */
    snapshot = undefined;
  }
  const durable = typeof snapshot?.title === "string" ? snapshot.title.trim() : "";
  if (durable !== "") return durable;

  const cwd = session?.header?.cwd;
  if (typeof cwd === "string" && cwd !== "") {
    const base = cwd.replace(/[/\\]+$/u, "").split(/[/\\]/u).pop();
    if (base !== undefined && base !== "") return base;
  }

  const id = session?.header?.id ?? session?.id;
  return id === undefined ? "DSH" : String(id);
}

/**
 * Describe a turn-end reason for a failure notification.
 *
 * @param reason - the `TurnEndReason` payload from `turn/end`.
 * @returns the reason kind plus a human-readable detail string.
 */
export function describeTurnFailure(reason) {
  const kind = typeof reason?.kind === "string" ? reason.kind : "error";
  const error = reason?.error;
  const detail =
    typeof error === "string"
      ? error
      : typeof error?.message === "string"
        ? error.message
        : typeof error?.code === "string"
          ? error.code
          : "";
  return { kind, detail };
}

/**
 * Whether this session must never raise a desktop notification.
 *
 * Delegated subagent sessions are excluded for the same reason the built-in
 * notifications row excludes them: they are internal fan-out, not the work the
 * reader started.
 *
 * @param session - the live session the event belongs to.
 * @returns `true` when the session is a subagent conversation.
 */
export function isSubagentSession(session) {
  return session?.header?.origin === "subagent";
}
