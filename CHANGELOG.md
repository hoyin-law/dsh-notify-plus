# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/hoyin-law/dsh-notify-plus/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hoyin-law/dsh-notify-plus/releases/tag/v0.1.0
