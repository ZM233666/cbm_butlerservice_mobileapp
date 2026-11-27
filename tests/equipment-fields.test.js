const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeEquipmentMap } = require("../server/services/equipment-fields");
const { validateTaskDraftPayload, validateTaskSubmitPayload } = require("../server/task-submit-payload");

test("normalizeEquipmentMap keeps filled fields and drops empty rows", () => {
  const out = normalizeEquipmentMap({
    a: { materialNumber: " PN-1 ", serialNumber: "" },
    b: { serial_number: "SN-2", overhaulDate: "2024-01-01" },
    c: { materialNumber: "  " },
    d: null,
  });
  assert.deepEqual(out, {
    a: { materialNumber: "PN-1" },
    b: { serialNumber: "SN-2", overhaulOrManufactureDate: "2024-01-01" },
  });
});

test("validateTaskDraftPayload passes equipment through", () => {
  const result = validateTaskDraftPayload({
    basicInfo: { taskId: "T1" },
    uploads: {},
    issues: {},
    equipment: {
      "row-1": { materialNumber: "M1", serialNumber: "S1", overhaulOrManufactureDate: "2025-06-01" },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.body.equipment, {
    "row-1": {
      materialNumber: "M1",
      serialNumber: "S1",
      overhaulOrManufactureDate: "2025-06-01",
    },
  });
});

test("validateTaskSubmitPayload accepts equipment-only content", () => {
  const result = validateTaskSubmitPayload({
    basicInfo: { taskId: "T1", mileageKm: 1000 },
    uploads: {},
    issues: {},
    equipment: { "row-1": { materialNumber: "M1" } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.equipment, { "row-1": { materialNumber: "M1" } });
});
