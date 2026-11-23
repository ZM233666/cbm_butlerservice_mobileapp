const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

// Mirror frontend resolve rules for a quick sanity check against PicSamples/
const LABEL_ALIAS = {
  "Abnormal Log": "Abnormal Log1.png",
  "BCM Plug1": "BCM Plug1_Plug2.png",
  "BCM Plug2": "BCM Plug1_Plug2.png",
  HDLC1: "HDLC1_2.png",
  HDLC2: "HDLC1_2.png",
  "IPM J1": "IPM J1_J4_J5_J6.png",
  "IPM J4": "IPM J1_J4_J5_J6.png",
  "IPM J5": "IPM J1_J4_J5_J6.png",
  "IPM J6": "IPM J1_J4_J5_J6.png",
  "IPM PN": "IPM PN_SN.png",
  "IPM SN": "IPM PN_SN.png",
  J100A: "J100A_101_102.png",
  J100B: "J100A_101_102.png",
  J101: "J100A_101_102.png",
  J102: "J100A_101_102.png",
  继电器1: "继电器1_2_3_4.png",
  继电器2: "继电器1_2_3_4.png",
  继电器3: "继电器1_2_3_4.png",
  继电器4: "继电器1_2_3_4.png",
};

function normalize(label) {
  let s = String(label || "").trim();
  for (const [pref, repl] of [
    ["EBVA", "EBV"],
    ["EBVB", "EBV"],
    ["LCDMA", "LCDM"],
    ["LCDMB", "LCDM"],
  ]) {
    if (s.startsWith(pref)) {
      s = repl + s.slice(pref.length);
      break;
    }
  }
  return s;
}

test("PicSamples files exist for alias and key exact labels", () => {
  const dir = path.join(__dirname, "..", "PicSamples");
  const files = new Set(fs.readdirSync(dir).filter((n) => n.endsWith(".png")));
  Object.values(LABEL_ALIAS).forEach((name) => {
    assert.ok(files.has(name), `missing alias target ${name}`);
  });
  ["LOCO Number.png", "EBV铭牌.png", "LCDM Plug.png", "IPM Socket.png"].forEach((name) => {
    assert.ok(files.has(name), `missing exact ${name}`);
  });
  assert.equal(LABEL_ALIAS["IPM PN"], "IPM PN_SN.png");
  assert.equal(normalize("EBVA PLUG"), "EBV PLUG");
  assert.equal(normalize("LCDMB铭牌"), "LCDM铭牌");
});
