/**
 * Settings surface shared with the DSH Desktop settings page.
 *
 * The namespace and the five keys below are the ones DSH Desktop already
 * renders toggles for, so reusing them verbatim means this plugin replaces the
 * built-in notifications row without taking away the user's switches. The
 * namespace brand is reproduced locally instead of imported so the plugin has
 * exactly one harness dependency (`@deepseek-ai/schemastery`).
 *
 * @module dsh-notify-plus/settings
 */

import z from "@deepseek-ai/schemastery";

/** Lowercase kebab-case namespace pattern enforced by `@deepseek-ai/dsh-settings`. */
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/u;

/**
 * Namespace owned by the DSH Desktop notification switches.
 *
 * Kept byte-identical to the built-in row so existing user settings keep
 * working after this plugin takes over.
 */
export const NOTIFICATIONS_SETTINGS_NAMESPACE = "dsh-desktop-notifications";

if (!NAMESPACE_PATTERN.test(NOTIFICATIONS_SETTINGS_NAMESPACE)) {
  throw new TypeError(`invalid settings namespace "${NOTIFICATIONS_SETTINGS_NAMESPACE}"`);
}

/** Live-reloadable notification toggles rendered by the Desktop settings page. */
export const NotificationsSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  notifyOnTurnCompletion: z.boolean().default(true),
  notifyOnTurnFailure: z.boolean().default(true),
  notifyOnJobCompletion: z.boolean().default(true),
  notifyOnJobFailure: z.boolean().default(true),
});

/** Resolved settings used before the settings scope is available. */
export const DEFAULT_SETTINGS = Object.freeze(NotificationsSettingsSchema({}));

/**
 * Resolve a settings snapshot with every field defaulted.
 *
 * @param value - a settings scope snapshot, or `undefined`.
 * @returns a frozen, fully-populated settings object.
 */
export function normalizeSettings(value) {
  if (value === undefined || value === null || typeof value !== "object") return DEFAULT_SETTINGS;
  return Object.freeze({ ...DEFAULT_SETTINGS, ...value });
}
