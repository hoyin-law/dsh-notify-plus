# Upstream engagement: the notification gap in DSH Desktop

This plugin exists because the notification row in `dsh-plugin-desktop`
hard-codes its copy, so a toast cannot say which conversation finished or what
it produced. This document records what was checked upstream and where the gap
actually stands, so the next person does not have to repeat the search.

## Duplicate check (required by the issue template)

The feature-request template for
[`anywhere-labs/deepseek-harness-desktop`](https://github.com/anywhere-labs/deepseek-harness-desktop)
requires searching open **and closed** issues and discussions first
(`blank_issues_enabled: false`, and `duplicate_check` is a required checkbox).
Doing that surfaced closely related threads, so **no new issue was filed**:

| Thread | Kind | Relevance |
| --- | --- | --- |
| [#969](https://github.com/anywhere-labs/deepseek-harness-desktop/pull/969) | PR, open, unmerged | Implements the same thing natively: live session title as the heading for every non-job notification, final-answer preview on turn completion, question and approval alerts, and a shared `showResponsePreview` switch. Supersedes #886. |
| [#886](https://github.com/anywhere-labs/deepseek-harness-desktop/pull/886) | PR, open, stale | Earlier pending-question notifications plus content previews. Superseded by #969. |
| [#967](https://github.com/anywhere-labs/deepseek-harness-desktop/issues/967) | Issue, open | Notify when an approval request stays pending. |
| [#877](https://github.com/anywhere-labs/deepseek-harness-desktop/issues/877) | Issue, open | Notify when the model asks a question. |
| [#951](https://github.com/anywhere-labs/deepseek-harness-desktop/issues/951) | Issue, open | Wants host-level governance of *third-party* plugin notifications: one channel, a per-plugin whitelist, a global mute. Its reporter sees the same symptom from the opposite direction  switches off, notifications still arriving. |
| [#947](https://github.com/anywhere-labs/deepseek-harness-desktop/issues/947) | Issue, open | `dsh-desktop.*` settings edits (including `notifications`) are overwritten by `profile-preferences` on the next launch. Affects the settings namespace this plugin shares. |

As of this writing, upstream `master`'s
[`notifications.ts`](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/dsh-plugin-desktop/src/notifications.ts)
still contains only the hard-coded table, so none of the above has shipped.

## Why coexistence is impossible

A third-party plugin cannot simply add a better observer next to the built-in
one. The built-in registers the `dsh-desktop-notifications` settings namespace,
and `@deepseek-ai/dsh-settings` rejects a second registration outright:

```js
register(ns, schema, options) {
  const parsedNs = parseSettingsNamespace(ns);
  if (this.registrations.has(parsedNs)) throw new Error(`settings namespace is already registered`);
  ...
}
```

So the three options are: disable the built-in row (what this plugin does, and
what DSH STORE's policy declines), use a private settings namespace but raise a
second toast per turn, or get a seam from the host. This is the concrete reason
"just write your own plugin" does not work, and it is what makes #951's
governance ask and #969's native implementation the real fixes.

## What is worth contributing upstream

Not a new request  evidence on the open threads. Two drafts, kept here rather
than filed unilaterally.

### For #969

> Independently implemented this outside the host
> ([dsh-notify-plus](https://github.com/hoyin-law/dsh-notify-plus)) and ran it on
> a live profile, so a few field notes that may be useful for the preview design:
>
> 1. **A raw preview of the final answer is often still too long to act on.**
>    The final assistant message routinely opens with boilerplate
>    ("好的，我已经") and then runs long. What worked was a deterministic
>    distillation: strip Markdown, split sentences, drop a leading
>    acknowledgement clause, then cut at a clause boundary inside a per-script
>    budget. For CJK that budget is 1020 characters, which is the size of a
>    toast body line; Latin needs a much larger budget. A byte- or
>    character-truncated preview and a clause-boundary cut read very differently
>    at that size.
> 2. **Turns that only call tools produce no prose at all.** Those fall back to
>    a tool-call count rather than an empty or misleading preview.
> 3. **Failure copy benefits from separating context exhaustion from a generic
>    error**  `max-tokens` reads very differently to a waiting user than a
>    crash.
> 4. If `showResponsePreview` stays the only knob, consider whether the preview
>    should be the *last* assistant message or the most informative one in the
>    turn; a closing "Done." is common and would otherwise become the toast
>    body.
>
> No code to port  this is only about the body-line design.

### For #951

> A data point from the other side of this: I wrote a plugin that intentionally
> **replaces** the desktop turn notification rather than adding a second one,
> and it still cannot coexist cleanly. `dsh-plugin-desktop` registers the
> `dsh-desktop-notifications` settings namespace, and `settings.register()`
> throws on a duplicate, so a plugin that reuses the existing switches cannot run
> alongside it  the only way is to disable the built-in row, which DSH STORE's
> policy then rejects.
>
> The governance you are asking for and the native implementation in #969 solve
> the same problem from two ends: once the official row is the single channel
> *and* is worth receiving, plugins should contribute copy instead of
> registering their own observer. With a copy-override seam
> (`ctx.get('desktopNotifications')?.resolve({ session, event, reason })`,
> falling back to the built-in constants) a plugin like mine becomes purely
> additive, the store policy stops conflicting with it, and the switches you
> want to govern keep a single owner.

## Status of this plugin

If #969 or an equivalent lands in a DSH Desktop release, this plugin's reason to
exist mostly disappears. It should then be retired, or reduced to the
distillation described above  not kept alive by disabling an official row that
is already correct.
