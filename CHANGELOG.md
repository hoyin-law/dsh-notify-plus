# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-09-14

Packaging and contract metadata only; no runtime behaviour changed.

### Added

- `dsh.compatibility` in the manifest: a per-release `dshReleases` declaration
  covering `0.1.1-rc.2`, `0.1.5-alpha.2`, `0.1.5-rc.1`, and `0.1.5-rc.2`, plus
  the Node.js range, the `win32` system, and the DSH Desktop host. Each entry is
  either runtime-verified (`0.1.1-rc.2`, installed into a live profile on DSH
  Desktop 2.0.3 and observed raising correctly-shaped toasts) or
  interface-verified (the four consumed surfaces diffed against each release's
  published types and sources and found unchanged).
- `docs/upstream-request.md`: the duplicate check that stopped us filing a new
  upstream request, the relevant open threads (`#969` PR for native session
  titles and answer previews, `#951` for host-level governance of plugin
  notifications, `#947` for `dsh-desktop.*` settings that do not persist), and
  two comment drafts worth contributing to them. Both READMEs now state that
  this plugin should be retired once that work ships rather than kept alive by
  disabling an official row that is already correct.
- A DSH STORE status section in both READMEs explaining why this plugin is not
  listed: the store declines bundle patches that disable a shipped entry, and
  disabling one is what makes the replacement possible, because both plugins
  register the same settings namespace and `settings.register()` throws on a
  duplicate.

## [0.1.0] - 2026-09-14

First release.

### Added

- Replacement for DSH Desktop's built-in `desktop-notifications` row, shipped as
  a bundle patch that disables the built-in observer and inserts this plugin so
  a turn raises exactly one toast.
- Conversation titles on every turn notification, read from the log-backed
  session title service with workspace-directory and session-id fallbacks.
- Deterministic, model-free distillation of the assistant's reply into one 10–20
  character CJK line or a Windows-sized Latin line, including Markdown stripping,
  sentence selection, filler-opener removal, and clause-boundary truncation.
- Failure notifications that carry the real error, with context exhaustion
  labelled separately.
- Background job notifications that carry the job label.
- Tool-call count fallback for turns that produce tool work but no prose.
- Reuse of the `dsh-desktop-notifications` settings namespace, so the existing
  DSH Desktop notification toggles keep working unchanged.
- Suppression for subagent sessions and turns no user message started, matching
  the built-in row.
- English and Chinese copy, selected from `desktopRuntime.locale`.
- 64 unit assertions across summarisation, copy, session projections, and the
  turn/job state machine, plus `npm run verify:layering` to compose the real
  patch layers through the `dsh` CLI.

[Unreleased]: https://github.com/hoyin-law/dsh-notify-plus/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/hoyin-law/dsh-notify-plus/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/hoyin-law/dsh-notify-plus/releases/tag/v0.1.0
