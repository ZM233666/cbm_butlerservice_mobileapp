const test = require("node:test");
const assert = require("node:assert/strict");
const { enrichIssueSubmitEntry } = require("../server/issue-submit-format");
const { normalizeIssueEntry } = require("../server/task-submit-payload");

test("enrichIssueSubmitEntry adds severity and bracketed result", () => {
  const out = enrichIssueSubmitEntry({
    status: "abnormal",
    text: "测试异常",
    severity: "severe",
    updatedAt: "2026-10-30T03:52:03.462Z",
  });
  assert.equal(out.severity, "severe");
  assert.equal(out.result, "发现异常（严重）：测试异常");
});

test("normalizeIssueEntry rebuilds result when severity present", () => {
  const out = normalizeIssueEntry({
    status: "abnormal",
    text: "测试异常",
    severity: "moderate",
    result: "发现异常：测试异常",
  });
  assert.equal(out.severity, "moderate");
  assert.equal(out.result, "发现异常（中等）：测试异常");
});
