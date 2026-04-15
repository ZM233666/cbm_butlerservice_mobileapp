const fs = require("fs");

function ensureDir(path) {
  fs.mkdirSync(path, { recursive: true });
}

function appendJsonLine(path, payload, callback) {
  const line = JSON.stringify(payload) + "\n";
  fs.appendFile(path, line, callback);
}

function readJsonArray(path) {
  try {
    const raw = fs.readFileSync(path, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_e) {
    return [];
  }
}

function readJsonObject(path) {
  try {
    const raw = fs.readFileSync(path, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch (_e) {
    return {};
  }
}

function writeJsonObject(path, payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

module.exports = {
  ensureDir,
  appendJsonLine,
  readJsonArray,
  readJsonObject,
  writeJsonObject,
};
