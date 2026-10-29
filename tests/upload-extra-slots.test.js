const test = require("node:test");
const assert = require("node:assert/strict");
const { expandSlotSeqMapForExtraUploads } = require("../server/upload-extra-slots");

test("expandSlotSeqMapForExtraUploads maps extra slots to base seq", () => {
  const map = { "r1-LOCO": "1", "r8-1-EBVA-PL": "2" };
  const uploads = {
    "r1-LOCO": { url: "/a.jpg" },
    "r1-LOCO__extra_1": { url: "/b.jpg" },
    "r1-LOCO__extra_2": { url: "/c.jpg" },
    "unknown-slot": { url: "/d.jpg" },
  };
  const out = expandSlotSeqMapForExtraUploads(map, uploads);
  assert.equal(out["r1-LOCO"], "1");
  assert.equal(out["r1-LOCO__extra_1"], "1");
  assert.equal(out["r1-LOCO__extra_2"], "1");
  assert.equal(out["unknown-slot"], undefined);
});
