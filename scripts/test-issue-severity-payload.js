#!/usr/bin/env node
/**
 * 验证 task-draft 请求体中 issues 含 severity + 带等级括号的 result。
 * 用法: node scripts/test-issue-severity-payload.js
 */
const { validateTaskDraftPayload } = require("../server/task-submit-payload");

const sample = {
  basicInfo: { taskId: "TASK-DEMO-001", employeeId: "1", maintenanceType: "c4" },
  issues: {
    r1: {
      status: "abnormal",
      text: "测试异常",
      severity: "severe",
      updatedAt: new Date().toISOString(),
    },
  },
  allowEmptyUploads: true,
};

const validated = validateTaskDraftPayload(sample);
if (!validated.ok) {
  console.error("FAIL validate:", validated.error);
  process.exit(1);
}
const row = validated.issues.r1;
const ok =
  row &&
  row.severity === "severe" &&
  row.result === "发现异常（严重）：测试异常" &&
  row.text === "测试异常";
if (!ok) {
  console.error("FAIL issues.r1:", row);
  process.exit(1);
}
console.log("PASS issue draft payload:", JSON.stringify(row, null, 2));
