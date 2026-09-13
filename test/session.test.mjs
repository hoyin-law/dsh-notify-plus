import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { countToolCalls, describeTurnFailure, isSubagentSession, sessionDisplayTitle, textOfMessage } from "../lib/session.js";

describe("textOfMessage", () => {
  it("joins text blocks and ignores everything else", () => {
    const message = {
      content: [
        { type: "reasoning", text: "thinking" },
        { type: "text", text: "第一段" },
        { type: "tool-call", name: "pwsh" },
        { type: "text", text: "第二段" },
      ],
    };
    assert.equal(textOfMessage(message), "第一段\n第二段");
  });

  it("returns an empty string for unusable input", () => {
    assert.equal(textOfMessage(undefined), "");
    assert.equal(textOfMessage({ content: "nope" }), "");
    assert.equal(textOfMessage({ content: [{ type: "text", text: "   " }] }), "");
  });
});

describe("countToolCalls", () => {
  it("counts tool-call blocks only", () => {
    assert.equal(countToolCalls({ content: [{ type: "tool-call" }, { type: "text", text: "x" }, { type: "tool-call" }] }), 2);
  });

  it("returns zero for unusable input", () => {
    assert.equal(countToolCalls(undefined), 0);
  });
});

describe("sessionDisplayTitle", () => {
  it("prefers the durable session title", () => {
    const titles = { get: () => ({ title: "  重构通知插件  " }) };
    assert.equal(sessionDisplayTitle(titles, { header: { id: "s1" } }), "重构通知插件");
  });

  it("falls back to the workspace directory name", () => {
    assert.equal(sessionDisplayTitle(undefined, { header: { id: "s1", cwd: "C:\\work\\dsh-notify-plus\\" } }), "dsh-notify-plus");
  });

  it("falls back to the session id when nothing else exists", () => {
    assert.equal(sessionDisplayTitle(undefined, { header: { id: "s1" } }), "s1");
    assert.equal(sessionDisplayTitle({ get: () => undefined }, { header: {} }), "DSH");
  });

  it("survives a title service that throws", () => {
    const titles = { get: () => { throw new Error("not live"); } };
    assert.equal(sessionDisplayTitle(titles, { header: { id: "s1" } }), "s1");
  });
});

describe("describeTurnFailure", () => {
  it("reads a message off the failure payload", () => {
    assert.deepEqual(describeTurnFailure({ kind: "error", error: new Error("请求超时") }), { kind: "error", detail: "请求超时" });
  });

  it("falls back to a code then to empty", () => {
    assert.deepEqual(describeTurnFailure({ kind: "max-tokens", error: { code: "context-length" } }), { kind: "max-tokens", detail: "context-length" });
    assert.deepEqual(describeTurnFailure(undefined), { kind: "error", detail: "" });
  });
});

describe("isSubagentSession", () => {
  it("excludes delegated subagent sessions", () => {
    assert.equal(isSubagentSession({ header: { origin: "subagent" } }), true);
    assert.equal(isSubagentSession({ header: {} }), false);
    assert.equal(isSubagentSession(undefined), false);
  });
});
