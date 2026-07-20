const test = require("node:test");
const assert = require("node:assert/strict");

const {
  postReportGenerateToDb,
  shouldRetryReportWithTaskNumber,
} = require("../server/services/django-task");

test("missing task id from upstream is retried with task number", () => {
  assert.equal(shouldRetryReportWithTaskNumber({ ok: false, error: "report_task_id_required" }), true);
  assert.equal(shouldRetryReportWithTaskNumber({ status: "failed", error: "report_task_id_required" }), true);
  assert.equal(shouldRetryReportWithTaskNumber({ ok: false, error: "report_broker_unavailable" }), false);
  assert.equal(shouldRetryReportWithTaskNumber({ ok: true, status: "queued" }), false);
});

test("report generation falls back to task number", async (t) => {
  const originalFetch = global.fetch;
  const originalBase = process.env.REMOTE_API_BASE;
  process.env.REMOTE_API_BASE = "http://127.0.0.1:8005";
  let sentBody = null;
  global.fetch = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 2000, data: { status: "queued", task_id: "celery-1" } }),
    };
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalBase == null) delete process.env.REMOTE_API_BASE;
    else process.env.REMOTE_API_BASE = originalBase;
  });

  await postReportGenerateToDb("MT-CCBII-89269", "token");

  assert.equal(sentBody.task_no, "MT-CCBII-89269");
  assert.equal(sentBody.task_id, undefined);
});
