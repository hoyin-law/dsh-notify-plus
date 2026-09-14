# dsh-notify-plus

[English](README.md) | [中文](README.zh.md)

Context-rich native notifications for **DSH Desktop**.

DSH Desktop's built-in notification tells you that *a* turn finished. It never
tells you *which* conversation, or *what* the turn actually produced — so the
toast is impossible to act on:

| | Built-in | dsh-notify-plus |
| --- | --- | --- |
| Title | `用户回合已完成` / `User Turn Completed` | `重构通知插件` — the live conversation title |
| Body | `一个由你发起的回合已完成。` / `A user-initiated turn has finished.` | `已经修复了通知排序，现在会优先选择最近的助手…` — a distilled one-liner |

This plugin replaces the built-in row and reuses its settings namespace, so the
existing Desktop toggles keep working and no user preference is lost.

## What it does

- **Titles every toast with the live conversation title.** The title comes from
  the log-backed session title service, so it follows renames and automatic
  title revisions instead of being a constant.
- **Distils the turn into one actionable line.** For CJK replies the body is
  10–20 characters; for Latin replies it stays inside the Windows toast body
  envelope. Nothing is sent to a model — the distillation is deterministic, so
  it costs no tokens and adds no latency.
- **Keeps failure reasons.** A failed turn reports the actual error instead of a
  generic apology, and a context-exhaustion stop is labelled separately.
- **Carries the job label** on background job notifications, so `pnpm test`
  finishing is distinguishable from several other jobs finishing at once.
- **Never fires for internal fan-out.** Delegated subagent sessions and turns
  that no user message started are ignored, exactly like the built-in row.

## Requirements

| | |
| --- | --- |
| DSH Desktop | 2.0.x (verified against 2.0.3) |
| Harness | `@deepseek-ai/dsh 0.1.1-rc.x` |
| Node | `>=22.19.0` (only for development and tests) |

The plugin depends on one harness-provided module, `@deepseek-ai/schemastery`,
which DSH already mounts. You do not need to install it yourself.

## Install

### From the DSH Desktop Market

Search for `dsh-notify-plus` in the Desktop plugin market and install it. The
market writes the package into the active profile's `dsh.profile.bundles`, which
is all this plugin needs.

### From the command line

```powershell
dsh plugin --profile <your-profile> add dsh-notify-plus
```

`dsh plugin` is a pnpm forwarder: it installs the package into the profile and
reconciles `dsh.profile.bundles` against the installed state. A package that
declares `dsh.bundle.patch` — this one does — joins the layer stack
automatically.

### From a local checkout

```powershell
git clone https://github.com/hoyin-law/dsh-notify-plus.git
dsh plugin --profile <your-profile> add C:\path\to\dsh-notify-plus
```

Then restart DSH Desktop. Confirm the row is live before assuming anything:

```powershell
dsh --profile <your-profile> dump-config | Select-String "dsh-notify-plus"
```

## How the replacement works

Both rows are Cordis plugins. Rather than racing the built-in observer (which
would raise two toasts per turn), this plugin ships a bundle patch that disables
the built-in row and inserts its own:

```yaml
- id: desktop-notifications
  disabled: true

- insert:
    - id: dsh-notify-plus
      name: dsh-notify-plus
```

The order matters and is what makes the override safe. DSH Desktop composes
patches as:

1. each layer in `dsh.profile.bundles`, in order — and the launcher splices its
   own `dsh-plugin-desktop` layer in right after `@deepseek-ai/dsh-web-app`;
2. the active profile's `cordis.patch.yml`;
3. `$DSH_HOME/cordis.patch.yml`;
4. the launcher's computed per-install patches.

Third-party bundles come after the launcher's layer, so an id-targeted patch in
this package's `cordis.patch.yml` wins over `desktop-notifications`. Patching a
row that does not exist is a warning rather than an error, which is why the same
patch stays inert — instead of breaking boot — on a host that is not DSH
Desktop.

## Settings

The plugin registers the `dsh-desktop-notifications` namespace with the same
five keys DSH Desktop already renders, so **Settings → Notifications** controls
this plugin unchanged:

| Key | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | Master switch for every notification |
| `notifyOnTurnCompletion` | `true` | A conversation turn finished |
| `notifyOnTurnFailure` | `true` | A conversation turn failed or ran out of context |
| `notifyOnJobCompletion` | `true` | A background job finished |
| `notifyOnJobFailure` | `true` | A background job failed |

DSH Desktop already suppresses notifications while its window is focused, so
nothing fires for work you are watching.

### A known upstream caveat

On DSH Desktop releases that ship the `profile-preferences` record, edits made
in **Settings → Notifications** may revert on the next launch. The desktop keeps
a private copy of `mode`, `openBrowser`, `networkExposure`, and `notifications`
under `<userData>/profile-preferences/<profileHash>/state.json` and mirrors it
back into `settings.yaml` at startup, while the settings page only writes
`settings.yaml`. This plugin reads whatever the document says, so it inherits the
revert exactly as the built-in row does.

Tracked upstream as
[issue #947](https://github.com/anywhere-labs/deepseek-harness-desktop/issues/947).
DSH Desktop 2.0.3 does not contain that mechanism and is unaffected; the report
is against 2.0.9, and the mirroring code first appears in a later release than
2.0.3.

This is deliberately **not** worked around here. That record is another
component's private source of truth: writing it from a plugin would add a second
writer to a single-document record that also holds the user's browser and
network-exposure choices.

## What the body line is

`lib/summarize.js` is dependency-free and deterministic. It:

1. strips fenced code, inline code, link targets, bare URLs, HTML tags,
   headings, list markers, blockquotes, emphasis, and control characters;
2. splits the remainder into sentences, keeping terminators attached;
3. drops a leading acknowledgement clause (`好的，`, `Sure,`) so the line starts
   with the work rather than the pleasantry;
4. accumulates sentences until the script's minimum is met;
5. truncates at a clause boundary inside the budget, appending `…`.

Budgets live in one place and are easy to argue with:

```js
export const DEFAULT_LIMITS = Object.freeze({
  cjk: Object.freeze({ min: 10, max: 20 }),
  latin: Object.freeze({ min: 40, max: 140 }),
});
```

When a turn produced tool work but no prose at all, the body falls back to a
tool-call count (`已完成 3 项工具调用…`) rather than a hollow "done".

## Compatibility

This plugin reads harness internals that are not a stable public contract:
`desktopRuntime.notifyAttention`, `sessions.on("session/event")`,
`ctx.get("sessionTitle")`, and `jobs.onJobDone`. The wiring is pinned to DSH
Desktop 2.0.3 and is verified by tests against that shape.

If a harness release changes those service shapes, the plugin fails loud at boot
rather than silently dropping notifications — `desktopRuntime` is a declared
hard dependency, so the row waits for the Desktop shell instead of activating
blind. Please open an issue with your DSH Desktop version if that happens.

## DSH STORE status

This plugin is **not listed in [DSH STORE](https://dsh.store/)**. The store's
automated policy declines any bundle patch that disables a shipped entry, and
disabling one is exactly what makes this plugin work: without it, the built-in
`desktop-notifications` row keeps raising its own toast, and the two plugins
cannot coexist at all — both register the `dsh-desktop-notifications` settings
namespace, and `settings.register()` throws on a duplicate, so the second one
fails its row.

That is a deliberate, documented trade rather than an oversight:

- The row this plugin disables belongs to `dsh-plugin-desktop` (the DSH Desktop
  launcher), not to a `@deepseek-ai/*` package. No official harness package,
  entry ID, or namespace is modified.
- The replacement is exact: the plugin re-registers the same settings namespace
  with the same five keys, so the Desktop switches keep working and no user
  preference is lost.
- Install and start were verified end to end on DSH Desktop 2.0.3; see
  [Verifying a live install](#verifying-a-live-install).

Install it from the repository instead:

```powershell
dsh plugin --profile <your-profile> add https://github.com/hoyin-law/dsh-notify-plus
```

A future release may make the disable an explicit opt-in in the user's own
profile layer, which would let the bundle patch become purely additive. That
needs the plugin to fall back to its own settings namespace when the built-in
row is still present, so it is a behaviour change rather than a packaging tweak.

### Upstream status

The capability this plugin adds is being implemented natively. Upstream `master`
still ships the hard-coded copy, but
[PR #969](https://github.com/anywhere-labs/deepseek-harness-desktop/pull/969)
adds session titles as notification headings plus a final-answer preview, and
[issue #951](https://github.com/anywhere-labs/deepseek-harness-desktop/issues/951)
asks for host-level governance of third-party plugin notifications.
[`docs/upstream-request.md`](docs/upstream-request.md) records the duplicate
check that stopped us filing a new request, the relevant threads, and what is
worth contributing to them.

If that work lands in a DSH Desktop release, this plugin should be retired
rather than kept alive by disabling an official row that is already correct.

### Declared compatibility

`package.json` carries a per-release declaration under
`dsh.compatibility.dshReleases`. Every entry is either runtime-verified or
interface-verified against the published package — never assumed:

| DSH release | Basis |
| --- | --- |
| `0.1.1-rc.2` | runtime-verified: installed into a live `web` profile on DSH Desktop 2.0.3 and observed raising correctly-shaped toasts |
| `0.1.5-alpha.2` | interface-verified: every consumed surface has an identical signature and payload shape |
| `0.1.5-rc.1` | interface-verified: same |
| `0.1.5-rc.2` | interface-verified: same |

"Interface-verified" means the four surfaces this plugin consumes —
`sessions.on("session/event")` with the `turn/start`, `turn/end`,
`assistant/message`, and `user/message` payloads; `sessionTitle.get(session)`;
`jobs.onJobDone(snapshot)` with `JobSnapshot.label`; and
`settings.register(ns, schema, options)` — were diffed against each release's
published types and sources and found unchanged. It is a source-level claim, not
a runtime acceptance, and it is labelled as such.

Only `win32` and the DSH Desktop host are declared. The notification path is
platform-neutral, but nothing else has been run.

## Development

```powershell
npm install            # only needed for the harness-provided schemastery peer
npm test               # 64 assertions across 4 suites, no harness required
npm run verify:layering   # composes the real patch layers via the dsh CLI
```

The test suite covers the pure layers — summarisation, copy, session
projections, and the turn/job state machine — with hand-built event fixtures, so
the behavioural contract is checked without launching Electron.

`verify:layering` is the one check that needs DSH Desktop installed. It builds a
throwaway `DSH_HOME`, stands in for the launcher-owned layer, and asks the real
`dsh --dump-config` to compose the tree, asserting that the built-in row ends up
`disabled: true`, that this plugin's row follows it, and that a host without the
built-in row still exits `0` with only a warning. Point it elsewhere if your
installation is not in the default location:

```powershell
node scripts/verify-layering.mjs --app "D:\Apps\DSH Desktop\DSH Desktop.exe"
```

```
lib/
  index.js       Cordis wiring: settings, jobs, sessions observers
  turn.js        session event -> notification payload state machine
  summarize.js   deterministic text distillation
  copy.js        localized copy for every locale
  session.js     read-only projections over DSH session values
  settings.js    the shared dsh-desktop-notifications namespace
cordis.patch.yml bundle patch: disable the built-in row, insert this one
scripts/
  verify-layering.mjs     composes the real patch layers through the dsh CLI
tools/
  asar.mjs                reads harness interfaces out of app.asar
  read-windows-toasts.mjs reads delivered toasts out of the Windows history DB
```

### Verifying a live install

`notifyAttention` returns early while the DSH Desktop window is focused, and it
raises an Electron `Notification` that leaves no application log line — so a
focused test can look like a no-op. The only reliable check is the shell's own
toast history:

```powershell
node tools/read-windows-toasts.mjs --limit 10
```

A working replacement looks like this, with the cutover exactly at the restart:

```
2026/9/14 04:33:35  title="重构通知插件"   body="已经修复了通知排序逻辑，现在会优先…"
2026/9/14 04:23:24  title="用户回合已完成"  body="一个由你发起的回合已完成。"
```

One row per turn, the title is a real conversation name, the body is a truncated
distillation rather than a fixed sentence, and the hard-coded row stops appearing
at the restart rather than alongside the new one — which is what proves the
built-in observer was disabled instead of merely joined.

## License

MIT
