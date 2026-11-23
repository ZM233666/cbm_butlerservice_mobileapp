const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  deriveTrainModelFromTrainNo,
  extractModelToken,
  formatGuidanceTemplateLabel,
  selectTemplateKey,
  readGuidanceDoc,
  buildSlotSeqMapFromDoc,
  buildTaskSummaryFromDoc,
} = require("../server/services/guidance-template");

const docPath = path.join(__dirname, "..", "public", "data", "brake-guidance-tasks-v1.0.json");
const doc = readGuidanceDoc(docPath);

test("deriveTrainModelFromTrainNo should use first 4 chars", () => {
  assert.equal(deriveTrainModelFromTrainNo("HXN30020"), "HXN3");
  assert.equal(deriveTrainModelFromTrainNo("HXD1-8888"), "HXD1");
  assert.equal(deriveTrainModelFromTrainNo("fxd1b001"), "FXD1");
});

test("extractModelToken should parse train numbers", () => {
  assert.equal(extractModelToken("HXD1-8888"), "HXD1");
  assert.equal(extractModelToken("ss4g_12"), "SS4G");
  assert.equal(extractModelToken("FXD1B-1"), "FXD1B");
  assert.equal(extractModelToken("HXN30020"), "HXN3");
});

test("formatGuidanceTemplateLabel should show axle·maint", () => {
  assert.equal(formatGuidanceTemplateLabel("6Axle+C1C2C3", "c1"), "6Axle·C1");
  assert.equal(formatGuidanceTemplateLabel("8Axle+C4C5C6", "C5"), "8Axle·C5");
});

test("selectTemplateKey should use 8-axle models first", () => {
  assert.equal(selectTemplateKey("HXD1-123", "c1", doc.templateSelection), "8Axle+C1C2C3");
  assert.equal(selectTemplateKey("SS4G", "C6", doc.templateSelection), "8Axle+C4C5C6");
  assert.equal(selectTemplateKey("FXD1B-9", "c3", doc.templateSelection), "8Axle+C1C2C3");
});

test("selectTemplateKey should fallback to 6-axle for other models", () => {
  assert.equal(selectTemplateKey("HXN30020", "c2", doc.templateSelection), "6Axle+C1C2C3");
  assert.equal(selectTemplateKey("other", "c5", doc.templateSelection), "6Axle+C4C5C6");
  assert.equal(selectTemplateKey("", "c1", doc.templateSelection), "6Axle+C1C2C3");
});

test("buildSlotSeqMapFromDoc should map slots for selected template", () => {
  const { templateKey, map } = buildSlotSeqMapFromDoc(doc, "HXD1-1", "c4");
  assert.equal(templateKey, "8Axle+C4C5C6");
  assert.equal(map["8axle-c4c5c6-1-1"], "1");
  assert.ok(Object.keys(map).length > 0);
});

test("buildTaskSummaryFromDoc should expose four templates and legacy maint aliases", () => {
  const summary = buildTaskSummaryFromDoc(doc);
  // Abnormal Log 行为条件必传，不计入始终必传 photos
  assert.equal(summary.templates["8Axle+C1C2C3"].photos, 27);
  assert.equal(summary.templates["6Axle+C4C5C6"].photos, 55);
  assert.equal(summary.maint.c1c3.photos, 34);
  assert.equal(summary.maint.c4c6.photos, 55);
});
