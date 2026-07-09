const fs = require("fs");
const path = require("path");

function mustBeJson(filePath, expectArrayOrRows) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (expectArrayOrRows === "array" && !Array.isArray(data)) {
    throw new Error(`${filePath} must be an array`);
  }
  if (expectArrayOrRows === "rows" && (!data || !Array.isArray(data.rows))) {
    throw new Error(`${filePath} must contain { rows: [] }`);
  }
}

function main() {
  const root = path.resolve(__dirname, "..");
  const tasksPath = path.join(root, "public", "data", "brake-guidance-tasks.json");
  mustBeJson(tasksPath, "rows");
  console.log("Static guidance data is valid JSON.");
}

main();
