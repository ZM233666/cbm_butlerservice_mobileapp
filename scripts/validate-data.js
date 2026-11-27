const fs = require("fs");
const path = require("path");
const {
  selectTemplateKey,
  getTemplateRows,
  buildTaskSummaryFromDoc,
} = require("../server/services/guidance-template");

function mustBeGuidanceV1(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object") {
    throw new Error(`${filePath} must be an object`);
  }
  if (!data.templateSelection || !Array.isArray(data.templateSelection.rules)) {
    throw new Error(`${filePath} must contain templateSelection.rules`);
  }
  if (!data.templates || typeof data.templates !== "object") {
    throw new Error(`${filePath} must contain templates`);
  }
  const expected = ["8Axle+C1C2C3", "8Axle+C4C5C6", "6Axle+C1C2C3", "6Axle+C4C5C6"];
  expected.forEach((key) => {
    const rows = getTemplateRows(data, key);
    if (!rows.length) throw new Error(`${filePath} template ${key} has no rows`);
  });

  const cases = [
    { model: "HXD1-8888", maint: "c1", expect: "8Axle+C1C2C3" },
    { model: "SS4G", maint: "C5", expect: "8Axle+C4C5C6" },
    { model: "HXN30020", maint: "c2", expect: "6Axle+C1C2C3" },
    { model: "FXN3B", maint: "c6", expect: "6Axle+C4C5C6" },
  ];
  cases.forEach((c) => {
    const got = selectTemplateKey(c.model, c.maint, data.templateSelection);
    if (got !== c.expect) {
      throw new Error(`template select ${c.model}+${c.maint}: expected ${c.expect}, got ${got}`);
    }
  });

  const summary = buildTaskSummaryFromDoc(data);
  if (!summary.templates["6Axle+C4C5C6"]) {
    throw new Error("summary missing 6Axle+C4C5C6");
  }
}

function main() {
  const root = path.resolve(__dirname, "..");
  const tasksPath = path.join(root, "public", "data", "brake-guidance-tasks-v1.0.json");
  mustBeGuidanceV1(tasksPath);
  console.log("Guidance v1.0 data is valid.");
}

main();
