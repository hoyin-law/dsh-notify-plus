/**
 * dsh-notify-plus  context-rich native notifications for DSH Desktop.
 *
 * DSH Desktop's built-in notification row tells the reader that *a* turn
 * finished, never *which* one or *what* it produced. This plugin replaces that
 * row and reuses its settings namespace, so the Desktop switches keep working
 * while every toast carries the live conversation title and a one-line
 * distillation of what the turn actually produced.
 *
 * Wiring contract, verified against DSH Desktop 2.0.3:
 * - `desktopRuntime.notifyAttention({ title, body })` is the only native
 *   surface; the shell already suppresses it while its window is focused.
 * - `sessions.on("session/event", (session, event) => ...)` exposes
 *   `turn/start`, `user/message`, `assistant/message`, and `turn/end`, where a
 *   turn counts as user-initiated once a `source.kind === "user"` message lands
 *   inside it.
 * - `ctx.get("sessionTitle").get(session)` folds the log-backed session title.
 * - `jobs.onJobDone(snapshot => ...)` reports background job settlement.
 *
 * @module dsh-notify-plus
 */

import { handleSessionEvent, notifyJobSettled } from "./turn.js";
import {
  DEFAULT_SETTINGS,
  NOTIFICATIONS_SETTINGS_NAMESPACE,
  NotificationsSettingsSchema,
  normalizeSettings,
} from "./settings.js";

/** Stable Cordis plugin name; also the row identity in `cordis.patch.yml`. */
export const name = "dsh-notify-plus";

/**
 * `desktopRuntime` is a hard dependency: the row exists only to call
 * `notifyAttention`, so waiting for the Desktop shell is correct and a missing
 * shell should fail loud rather than silently drop notifications.
 */
export const inject = ["desktopRuntime"];

/**
 * Install the notification observers.
 *
 * The optional observers are registered through `ctx.inject`, so a harness that
 * mounts no settings, jobs, or session store degrades to a no-op instead of
 * failing the whole configuration tree.
 *
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  let settings = DEFAULT_SETTINGS;

  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.effect(() => {
      const scope = settingsCtx.settings.register(
        NOTIFICATIONS_SETTINGS_NAMESPACE,
        NotificationsSettingsSchema,
        { applies: "live" },
      );
      settings = normalizeSettings(scope.get());
      const stopWatching = scope.watch((next) => {
        settings = normalizeSettings(next);
      });
      return () => {
        stopWatching();
        settings = DEFAULT_SETTINGS;
      };
    }, "dsh-notify-plus: notification settings");
  });

  ctx.inject(["jobs"], (jobsCtx) => {
    jobsCtx.effect(
      () =>
        jobsCtx.jobs.onJobDone((snapshot) => {
          notifyJobSettled(jobsCtx.desktopRuntime, () => settings, snapshot);
        }),
      "dsh-notify-plus: background job attention",
    );
  });

  ctx.inject(["sessions"], (sessionsCtx) => {
    sessionsCtx.effect(() => {
      const openTurns = new Map();
      const stopEvents = sessionsCtx.on("session/event", (session, event) => {
        handleSessionEvent(ctx, sessionsCtx, () => settings, openTurns, session, event);
      });
      const stopDisposed = sessionsCtx.on("session/disposed", (session) => {
        openTurns.delete(String(session?.header?.id ?? session?.id ?? ""));
      });
      return () => {
        stopDisposed();
        stopEvents();
        openTurns.clear();
      };
    }, "dsh-notify-plus: per-turn attention");
  });
}
