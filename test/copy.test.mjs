import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  jobCopy,
  normalizeLabel,
  resolveLocale,
  toolFallbackCopy,
  turnCompletedCopy,
  turnFailedCopy,
} from "../lib/copy.js";

describe("resolveLocale", () => {
  it("accepts DSH Desktop locale tags", () => {
    assert.equal(resolveLocale("zh-CN"), "zh");
    assert.equal(resolveLocale("zh"), "zh");
    assert.equal(resolveLocale("en-US"), "en");
  });

  it("falls back to English for unknown or missing tags", () => {
    assert.equal(resolveLocale("fr-FR"), "en");
    assert.equal(resolveLocale(undefined), "en");
    assert.equal(resolveLocale(""), "en");
  });
});

describe("turnCompletedCopy", () => {
  it("always uses the conversation title as the toast title", () => {
    const copy = turnCompletedCopy({ locale: "zh", title: "重构通知插件", body: "已完成重构。" });
    assert.equal(copy.title, "重构通知插件");
    assert.equal(copy.body, "已完成重构。");
  });

  it("falls back to localized copy when the body is empty", () => {
    assert.equal(
      turnCompletedCopy({ locale: "zh", title: "t", body: "" }).body,
      "已完成，打开 DSH Desktop 查看结果。",
    );
    assert.equal(
      turnCompletedCopy({ locale: "en", title: "t", body: "" }).body,
      "Finished. Open DSH Desktop to review the result.",
    );
  });
});

describe("turnFailedCopy", () => {
  it("names the conversation and the reason", () => {
    const copy = turnFailedCopy({ locale: "zh", title: "重构通知插件", reason: "请求超时", kind: "error" });
    assert.equal(copy.title, "重构通知插件");
    assert.equal(copy.body, "未能完成：请求超时");
  });

  it("distinguishes a context-exhaustion stop", () => {
    const copy = turnFailedCopy({ locale: "zh", title: "t", reason: "上限", kind: "max-tokens" });
    assert.equal(copy.body, "上下文用尽：上限");
  });

  it("degrades to the generic line without a reason", () => {
    assert.equal(
      turnFailedCopy({ locale: "zh", title: "t", reason: "", kind: "error" }).body,
      "未能完成，请打开 DSH Desktop 查看详情。",
    );
    assert.equal(
      turnFailedCopy({ locale: "en", title: "t", reason: "", kind: "error" }).body,
      "Could not finish. Open DSH Desktop for details.",
    );
  });
});

describe("jobCopy", () => {
  it("carries the job label for a localized outcome", () => {
    assert.deepEqual(jobCopy({ locale: "zh", status: "completed", label: "pnpm test" }), {
      title: "后台任务已完成",
      body: "「pnpm test」已结束。",
    });
    assert.deepEqual(jobCopy({ locale: "en", status: "failed", label: "pnpm test" }), {
      title: "Background Job Failed",
      body: "pnpm test could not finish.",
    });
  });

  it("falls back to a generic sentence for a missing label", () => {
    assert.equal(jobCopy({ locale: "zh", status: "completed", label: undefined }).body, "有一个后台任务已结束。");
  });
});

describe("normalizeLabel", () => {
  it("collapses whitespace and clips long labels", () => {
    assert.equal(normalizeLabel("  pnpm   test  "), "pnpm test");
    assert.equal(normalizeLabel("abcdef", 3), "abc…");
  });
});

describe("toolFallbackCopy", () => {
  it("reports tool-only turns", () => {
    assert.equal(toolFallbackCopy("zh", 3), "已完成 3 项工具调用，打开 DSH Desktop 查看详情。");
  });

  it("stays empty when there is no tool work", () => {
    assert.equal(toolFallbackCopy("zh", 0), "");
  });
});
