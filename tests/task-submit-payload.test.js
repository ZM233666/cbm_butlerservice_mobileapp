const test = require("node:test");
const assert = require("node:assert/strict");
const {
  pickTaskId,
  normalizeUploadsMap,
  normalizeIssuesMap,
  validateTaskSubmitPayload,
  validateTaskDraftPayload,
} = require("../server/task-submit-payload");

test("pickTaskId reads basicInfo.taskId and fallbacks", () => {
  assert.equal(pickTaskId({ basicInfo: { taskId: "T1" } }), "T1");
  assert.equal(pickTaskId({ basicInfo: { mainTaskId: "T2" } }), "T2");
  assert.equal(pickTaskId({ taskId: "T3" }), "T3");
  assert.equal(pickTaskId({}), "");
});

test("normalizeUploadsMap drops empty urls", () => {
  const out = normalizeUploadsMap({
    a: { url: " /u/1.jpg " },
    b: { url: "" },
    c: { url: "/u/2.jpg", capture: { lat: 1 } },
    d: null,
  });
  assert.deepEqual(out, {
    a: { url: "/u/1.jpg" },
    c: { url: "/u/2.jpg", capture: { lat: 1 } },
  });
});

test("normalizeIssuesMap keeps status-only and text issues", () => {
  const out = normalizeIssuesMap({
    r1: { text: " 看不清车号 ", updatedAt: "2026-07-09T08:00:00.000Z" },
    r2: { text: "" },
    r3: { status: "ok" },
    r4: { status: "abnormal", text: "插头松动" },
    r5: { status: "no_equipment" },
    r6: {
      status: "abnormal",
      text: "漏油",
      severity: "severe",
      result: "发现异常（高风险）：漏油",
    },
    r7: { status: "abnormal", text: "x", severity: "invalid" },
  });
  assert.deepEqual(out, {
    r1: { text: "看不清车号", updatedAt: "2026-07-09T08:00:00.000Z" },
    r3: { status: "ok" },
    r4: { status: "abnormal", text: "插头松动", result: "发现异常：插头松动" },
    r5: { status: "no_equipment" },
    r6: {
      status: "abnormal",
      text: "漏油",
      severity: "severe",
      result: "发现异常（高风险）：漏油",
    },
    r7: { status: "abnormal", text: "x", result: "发现异常：x" },
  });
});

test("validateTaskSubmitPayload requires taskId and content by default", () => {
  assert.deepEqual(validateTaskSubmitPayload({}), {
    ok: false,
    error: "task_id_required",
  });
  assert.deepEqual(
    validateTaskSubmitPayload({ basicInfo: { taskId: "T1", mileageKm: 1 }, uploads: {}, issues: {} }),
    { ok: false, error: "submit_payload_required" },
  );
});

test("validateTaskSubmitPayload allows issues-only submit", () => {
  const result = validateTaskSubmitPayload({
    basicInfo: { taskId: "T1", mileageKm: 5000 },
    uploads: {},
    issues: { r1: { status: "ok" } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, { r1: { status: "ok" } });
});

test("validateTaskSubmitPayload allows empty payload when not required", () => {
  const result = validateTaskSubmitPayload(
    { basicInfo: { taskId: "T1", mileageKm: 100 }, uploads: {}, issues: {} },
    { requireContent: false },
  );
  assert.equal(result.ok, true);
});

test("validateTaskDraftPayload requires mileage on draft save", () => {
  assert.deepEqual(validateTaskDraftPayload({ basicInfo: { taskId: "T1" } }), {
    ok: false,
    error: "mileage_required",
  });
  const result = validateTaskDraftPayload({
    basicInfo: { taskId: "T1", mileageKm: "120000" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.body.basicInfo.mileageKm, 120000);
});
