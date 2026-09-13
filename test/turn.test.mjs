import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTurnState, distillTurn, handleSessionEvent, notifyJobSettled } from "../lib/turn.js";

const SETTINGS = {
  enabled: true,
  notifyOnTurnCompletion: true,
  notifyOnTurnFailure: true,
  notifyOnJobCompletion: true,
  notifyOnJobFailure: true,
};

/** A desktop runtime stub that records every raised notification. */
function fakeRuntime(locale = "zh") {
  const raised = [];
  return { locale, raised, notifyAttention: (notification) => raised.push(notification) };
}

/** A title service stub returning one fixed durable title. */
function fakeCtx(title) {
  return { get: (service) => (service === "sessionTitle" ? { get: () => ({ title }) } : undefined) };
}

function textMessage(turn, text) {
  return { type: "assistant/message", data: { turn, message: { content: [{ type: "text", text }] } } };
}

/** Drive a whole turn through the handler and return the runtime stub. */
function runTurn(events, { settings = SETTINGS, session = { header: { id: "s1", cwd: "C:\\work\\demo" } }, ctx = fakeCtx("重构通知插件"), runtime = fakeRuntime() } = {}) {
  const openTurns = new Map();
  const sessionsCtx = { desktopRuntime: runtime };
  for (const event of events) handleSessionEvent(ctx, sessionsCtx, () => settings, openTurns, session, event);
  return { runtime, openTurns };
}

describe("createTurnState", () => {
  it("starts closed to synthetic turns", () => {
    assert.deepEqual(createTurnState(3), { turn: 3, userInitiated: false, texts: [], toolCalls: 0 });
  });
});

describe("distillTurn", () => {
  it("prefers the newest informative message", () => {
    const summary = distillTurn(["我先看日志。", "已经修复了通知排序，现在会优先选择最近的助手消息。"]);
    assert.ok(summary.startsWith("已经修复了通知排序"), summary);
  });

  it("skips a closing acknowledgement when an earlier line informs", () => {
    const summary = distillTurn(["已经修复了通知排序，现在会优先选择最近的助手消息。", "完成。"]);
    assert.ok(summary.startsWith("已经修复了通知排序"), summary);
  });

  it("returns an empty string when nothing is usable", () => {
    assert.equal(distillTurn([]), "");
    assert.equal(distillTurn(["```\ncode\n```"]), "");
  });
});

describe("handleSessionEvent", () => {
  it("notifies with the conversation title and a distilled body", () => {
    const { runtime } = runTurn([
      { type: "turn/start", data: { turn: 1 } },
      { type: "user/message", data: { source: { kind: "user" } } },
      textMessage(1, "已经修复了通知排序，现在会优先选择最近的助手消息。"),
      { type: "turn/end", data: { turn: 1, reason: { kind: "completed" } } },
    ]);
    assert.equal(runtime.raised.length, 1);
    assert.equal(runtime.raised[0].title, "重构通知插件");
    assert.ok(runtime.raised[0].body.startsWith("已经修复了通知排序"), runtime.raised[0].body);
  });

  it("stays silent for a turn the user never started", () => {
    const { runtime } = runTurn([
      { type: "turn/start", data: { turn: 1 } },
      textMessage(1, "这是合成输入触发的回合。"),
      { type: "turn/end", data: { turn: 1, reason: { kind: "completed" } } },
    ]);
    assert.equal(runtime.raised.length, 0);
  });

  it("stays silent for delegated subagent sessions", () => {
    const { runtime } = runTurn(
      [
        { type: "turn/start", data: { turn: 1 } },
        { type: "user/message", data: { source: { kind: "user" } } },
        textMessage(1, "子代理完成了一部分检索。"),
        { type: "turn/end", data: { turn: 1, reason: { kind: "completed" } } },
      ],
      { session: { header: { id: "s2", origin: "subagent" } } },
    );
    assert.equal(runtime.raised.length, 0);
  });

  it("falls back to a tool-call count when the turn produced no prose", () => {
    const { runtime } = runTurn([
      { type: "turn/start", data: { turn: 1 } },
      { type: "user/message", data: { source: { kind: "user" } } },
      { type: "assistant/message", data: { turn: 1, message: { content: [{ type: "tool-call" }, { type: "tool-call" }] } } },
      { type: "turn/end", data: { turn: 1, reason: { kind: "completed" } } },
    ]);
    assert.match(runtime.raised[0].body, /2 项工具调用/u);
  });

  it("reports a failure with the reason and the conversation title", () => {
    const { runtime } = runTurn([
      { type: "turn/start", data: { turn: 1 } },
      { type: "user/message", data: { source: { kind: "user" } } },
      { type: "turn/end", data: { turn: 1, reason: { kind: "error", error: { message: "请求超时" } } } },
    ]);
    assert.deepEqual(runtime.raised[0], { title: "重构通知插件", body: "未能完成：请求超时" });
  });

  it("marks a context-exhaustion stop distinctly", () => {
    const { runtime } = runTurn([
      { type: "turn/start", data: { turn: 1 } },
      { type: "user/message", data: { source: { kind: "user" } } },
      { type: "turn/end", data: { turn: 1, reason: { kind: "max-tokens", error: undefined } } },
    ]);
    assert.match(runtime.raised[0].body, /上下文用尽/u);
  });

  it("stays silent for a user-cancelled turn", () => {
    const { runtime } = runTurn([
      { type: "turn/start", data: { turn: 1 } },
      { type: "user/message", data: { source: { kind: "user" } } },
      { type: "turn/end", data: { turn: 1, reason: { kind: "aborted" } } },
    ]);
    assert.equal(runtime.raised.length, 0);
  });

  it("ignores a turn/end that does not match the open turn", () => {
    const { runtime, openTurns } = runTurn([
      { type: "turn/start", data: { turn: 1 } },
      { type: "user/message", data: { source: { kind: "user" } } },
      { type: "turn/end", data: { turn: 99, reason: { kind: "completed" } } },
    ]);
    assert.equal(runtime.raised.length, 0);
    assert.equal(openTurns.has("s1"), true);
  });

  it("drops turns for sessions that were never opened", () => {
    const { runtime } = runTurn([textMessage(1, "没有起始事件的助手消息。")]);
    assert.equal(runtime.raised.length, 0);
  });

  it("honours every settings switch", () => {
    const events = [
      { type: "turn/start", data: { turn: 1 } },
      { type: "user/message", data: { source: { kind: "user" } } },
      textMessage(1, "已经修复了通知排序，现在会优先选择最近的助手消息。"),
      { type: "turn/end", data: { turn: 1, reason: { kind: "completed" } } },
    ];
    assert.equal(runTurn(events, { settings: { ...SETTINGS, enabled: false } }).runtime.raised.length, 0);
    assert.equal(runTurn(events, { settings: { ...SETTINGS, notifyOnTurnCompletion: false } }).runtime.raised.length, 0);
  });

  it("survives a session store without a desktop runtime", () => {
    const openTurns = new Map();
    const sessionsCtx = {};
    assert.doesNotThrow(() => {
      for (const event of [
        { type: "turn/start", data: { turn: 1 } },
        { type: "user/message", data: { source: { kind: "user" } } },
        textMessage(1, "已经修复了通知排序，现在会优先选择最近的助手消息。"),
        { type: "turn/end", data: { turn: 1, reason: { kind: "completed" } } },
      ]) {
        handleSessionEvent(fakeCtx("t"), sessionsCtx, () => SETTINGS, openTurns, { header: { id: "s1" } }, event);
      }
    });
  });
});

describe("notifyJobSettled", () => {
  it("reports a completed job with its label", () => {
    const runtime = fakeRuntime("zh");
    notifyJobSettled(runtime, () => SETTINGS, { status: "completed", label: "pnpm test" });
    assert.deepEqual(runtime.raised[0], { title: "后台任务已完成", body: "「pnpm test」已结束。" });
  });

  it("ignores non-terminal and disabled cases", () => {
    const runtime = fakeRuntime("zh");
    notifyJobSettled(runtime, () => SETTINGS, { status: "running", label: "pnpm test" });
    notifyJobSettled(runtime, () => SETTINGS, { status: "killed", label: "pnpm test" });
    notifyJobSettled(runtime, () => ({ ...SETTINGS, enabled: false }), { status: "failed", label: "x" });
    notifyJobSettled(runtime, () => ({ ...SETTINGS, notifyOnJobCompletion: false }), { status: "completed", label: "x" });
    assert.equal(runtime.raised.length, 0);
  });
});
