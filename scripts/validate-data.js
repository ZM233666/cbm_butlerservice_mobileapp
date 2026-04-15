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
  if (expectArrayOrRows === "tasks" && (!data || !Array.isArray(data.tasks))) {
    throw new Error(`${filePath} must contain { tasks: [] }`);
  }
}

function main() {
  const root = path.resolve(__dirname, "..");
  const tasksPath = path.join(root, "public", "data", "brake-guidance-tasks.json");
  const recordsPath = path.join(root, "server", "data", "records.json");
  const homeConfigPath = path.join(root, "server", "data", "home-config.json");

  mustBeJson(tasksPath, "rows");
  mustBeJson(recordsPath, "array");
  mustBeJson(homeConfigPath, "tasks");
  console.log("Data files are valid JSON.");
}

main();
