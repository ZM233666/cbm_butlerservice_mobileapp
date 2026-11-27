const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCompactUploadSlotMoves,
  groupUploadSlotIds,
} = require("../server/upload-slot-compact.js");

test("promote first extra to base when base empty", () => {
  const keys = ["r1-LOCO", "r1-LOCO__extra_1"];
  const has = (id) => id === "r1-LOCO__extra_1";
  const moves = buildCompactUploadSlotMoves("r1-LOCO", keys, has);
  assert.deepEqual(moves, [
    { from: "r1-LOCO__extra_1", to: "r1-LOCO", extraIndex: null },
  ]);
});

test("renumber extras after deleting base", () => {
  const keys = ["r1-LOCO", "r1-LOCO__extra_1", "r1-LOCO__extra_2"];
  const has = (id) => id === "r1-LOCO__extra_1" || id === "r1-LOCO__extra_2";
  const moves = buildCompactUploadSlotMoves("r1-LOCO", keys, has);
  assert.deepEqual(moves, [
    { from: "r1-LOCO__extra_1", to: "r1-LOCO", extraIndex: null },
    { from: "r1-LOCO__extra_2", to: "r1-LOCO__extra_1", extraIndex: 1 },
  ]);
});

test("groupUploadSlotIds lists base then sorted extras", () => {
  const ids = groupUploadSlotIds("r1-LOCO", [
    "r1-LOCO__extra_2",
    "r1-LOCO",
    "r1-LOCO__extra_1",
  ]);
  assert.deepEqual(ids, ["r1-LOCO", "r1-LOCO__extra_1", "r1-LOCO__extra_2"]);
});
