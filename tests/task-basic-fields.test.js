const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeMileageKm, validateBasicInfoMileage } = require("../server/task-basic-fields");

test("validateBasicInfoMileage requires mileage when configured", () => {
  assert.deepEqual(validateBasicInfoMileage({}, { required: true }), {
    ok: false,
    error: "mileage_required",
  });
  assert.deepEqual(validateBasicInfoMileage({ mileageKm: "100" }, { required: true }), {
    ok: true,
    mileageKm: 100,
  });
});

test("normalizeMileageKm rejects invalid values", () => {
  assert.equal(normalizeMileageKm("12345"), 12345);
  assert.equal(normalizeMileageKm("-1"), null);
  assert.equal(normalizeMileageKm("abc"), null);
});
