const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeIssuesMap } = require("../server/task-submit-payload");

test("normalizeIssuesMap preserves abnormal severity and result for draft/submit", () => {
  const out = normalizeIssuesMap({
    r1: {
      status: "abnormal",
      text: "测试异常",
      severity: "severe",
      result: "发现异常（严重）：测试异常",
      updatedAt: "2026-10-30T03:09:25.395Z",
    },
  });
  assert.deepEqual(out.r1, {
    status: "abnormal",
    text: "测试异常",
    severity: "severe",
    result: "发现异常（严重）：测试异常",
    updatedAt: "2026-10-30T03:09:25.395Z",
  });
});
