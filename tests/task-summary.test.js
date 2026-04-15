const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTaskSummary } = require("../server/services/task-summary");

const rows = [
  { seq: "1", scopeTags: ["all"], buttons: [{ slot: "a" }, { slot: "b" }] },
  { seq: "2", scopeTags: ["c4c6"], buttons: [{ slot: "c" }] },
  { seq: "3.4", scopeTags: ["c1c3"], buttons: [] },
];

test("buildTaskSummary should calculate item counts by maintenance type", () => {
  const summary = buildTaskSummary(rows);
  assert.equal(summary.maint.c1c3.items, 2);
  assert.equal(summary.maint.c4c6.items, 2);
});

test("buildTaskSummary should calculate photo counts by maintenance type", () => {
  const summary = buildTaskSummary(rows);
  assert.equal(summary.maint.c1c3.photos, 2);
  assert.equal(summary.maint.c4c6.photos, 3);
});

test("buildTaskSummary should expose per-seq visibility", () => {
  const summary = buildTaskSummary(rows);
  const seq2 = summary.perSeq.find((x) => x.seq === "2");
  const seq34 = summary.perSeq.find((x) => x.seq === "3.4");
  assert.equal(seq2.c1c3, null);
  assert.equal(seq2.c4c6, 1);
  assert.equal(seq34.c1c3, 0);
  assert.equal(seq34.c4c6, null);
});
