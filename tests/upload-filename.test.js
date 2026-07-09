const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizePart,
  normalizeExt,
  timestampCompact,
  buildNormalizedTaskFilename,
} = require("../server/upload-filename");

test("sanitizePart keeps safe chars and falls back", () => {
  assert.equal(sanitizePart("MT-CCBII-88521"), "MT-CCBII-88521");
  assert.equal(sanitizePart("  slot/a  "), "slot_a");
  assert.equal(sanitizePart(""), "na");
});

test("normalizeExt adds dot and defaults to jpg", () => {
  assert.equal(normalizeExt("png"), ".png");
  assert.equal(normalizeExt(".jpeg"), ".jpeg");
  assert.equal(normalizeExt(""), ".jpg");
  assert.equal(normalizeExt("weird!!!"), ".jpg");
});

test("timestampCompact is YYYYMMDDHHmmss", () => {
  const ts = timestampCompact(new Date("2026-04-15T08:30:45.123Z"));
  assert.match(ts, /^\d{14}$/);
  assert.equal(ts, "20260415083045");
});

test("buildNormalizedTaskFilename follows task__slot__employee__ts__rand.ext", () => {
  const name = buildNormalizedTaskFilename({
    taskId: "MT-CCBII-88521",
    slotId: "slot-1",
    employeeId: "20005303",
    ext: ".png",
    now: new Date("2026-04-15T08:30:45.123Z"),
  });
  assert.match(
    name,
    /^MT-CCBII-88521__slot-1__20005303__20260415083045__[a-z0-9]{4}\.png$/,
  );
});
