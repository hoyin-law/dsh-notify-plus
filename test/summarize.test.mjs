import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  charCount,
  cleanText,
  detectScript,
  dropFillerOpener,
  resolveLimits,
  splitSentences,
  summarize,
  summarizeFailure,
} from "../lib/summarize.js";

describe("cleanText", () => {
  it("drops fenced code blocks instead of summarising them", () => {
    const raw = "运行下面这段脚本：\n\n```powershell\nGet-Process | Stop-Process\n```\n\n然后检查端口占用。";
    const cleaned = cleanText(raw);
    assert.ok(!cleaned.includes("Get-Process"));
    assert.ok(cleaned.includes("然后检查端口占用。"));
  });

  it("keeps link labels and removes targets", () => {
    assert.equal(cleanText("见 [发布说明](https://example.com/notes) 了解详情。"), "见 发布说明 了解详情。");
  });

  it("strips headings, list markers, blockquotes and emphasis", () => {
    const raw = "## 结果\n\n- **已修复** 排序\n> 备注\n";
    assert.equal(cleanText(raw), "结果 已修复 排序 备注");
  });

  it("drops bare URLs and control characters", () => {
    assert.equal(cleanText("a\u0000b https://example.com c"), "a b c");
  });

  it("returns an empty string for non-string input", () => {
    assert.equal(cleanText(undefined), "");
    assert.equal(cleanText(42), "");
  });
});

describe("detectScript", () => {
  it("classifies Chinese prose as cjk", () => {
    assert.equal(detectScript("我已经修复了通知排序逻辑。"), "cjk");
  });

  it("classifies English prose as latin", () => {
    assert.equal(detectScript("I fixed the notification ordering."), "latin");
  });

  it("classifies CJK text with embedded identifiers as cjk", () => {
    assert.equal(detectScript("我已经把 dsh-notify-plus 插件的排序逻辑修复好了。"), "cjk");
  });

  it("treats empty input as latin", () => {
    assert.equal(detectScript("   "), "latin");
  });
});

describe("splitSentences", () => {
  it("splits on Chinese terminators and keeps them attached", () => {
    assert.deepEqual(splitSentences("先做这个。再做那个！"), ["先做这个。", "再做那个！"]);
  });

  it("splits English sentences only at real boundaries", () => {
    assert.deepEqual(splitSentences("First thing. Second thing."), ["First thing.", "Second thing."]);
  });
});

describe("dropFillerOpener", () => {
  it("removes a short acknowledgement clause", () => {
    assert.equal(dropFillerOpener("好的，我已经完成了重构。"), "我已经完成了重构。");
  });

  it("keeps a clause that already names the work", () => {
    assert.equal(dropFillerOpener("我已经完成了重构，稍后补充测试。"), "我已经完成了重构，稍后补充测试。");
  });

  it("keeps a sentence with no comma", () => {
    assert.equal(dropFillerOpener("重构完成"), "重构完成");
  });
});

describe("resolveLimits", () => {
  it("uses the product budget for CJK", () => {
    assert.deepEqual(resolveLimits("cjk"), { min: 10, max: 20 });
  });

  it("accepts overrides and never lets min exceed max", () => {
    assert.deepEqual(resolveLimits("cjk", { min: 40, max: 12 }), { min: 12, max: 12 });
  });
});

describe("summarize", () => {
  it("produces a 10-20 character Chinese line", () => {
    const summary = summarize("我已经修复了排序逻辑，现在会优先选择最近的助手消息。");
    assert.ok(summary.startsWith("我已经修复了排序逻辑"), summary);
    assert.ok(summary.endsWith(""), summary);
    const length = charCount(summary);
    assert.ok(length >= 10 && length <= 20, `length ${length} for ${summary}`);
  });

  it("keeps a short Chinese sentence intact without an ellipsis", () => {
    const summary = summarize("已切换为本地模型。");
    assert.equal(summary, "已切换为本地模型。");
  });

  it("drops the acknowledgement opener before choosing the line", () => {
    assert.equal(summarize("好的，迁移脚本已经跑完了。"), "迁移脚本已经跑完了。");
  });

  it("keeps English inside the Windows toast body envelope", () => {
    const summary = summarize(
      "I replaced the hard-coded notification copy with the live conversation title and a distilled body.",
    );
    assert.ok(summary.startsWith("I replaced the hard-coded"), summary);
    assert.ok(charCount(summary) <= 140, summary);
  });

  it("returns an empty string when there is nothing to say", () => {
    assert.equal(summarize(""), "");
    assert.equal(summarize("```\ncode only\n```"), "");
  });
});

describe("summarizeFailure", () => {
  it("reads a message off a thrown error", () => {
    assert.equal(summarizeFailure(new Error("请求超时")), "请求超时");
  });

  it("falls back to a code", () => {
    assert.equal(summarizeFailure({ code: "rate-limited" }), "rate-limited");
  });

  it("returns an empty string for unusable input", () => {
    assert.equal(summarizeFailure(undefined), "");
  });
});
