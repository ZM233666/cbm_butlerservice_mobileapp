const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { buildConfig } = require("../server/config");

test("default MAX_UPLOAD_MB is 30", () => {
  const prev = process.env.MAX_UPLOAD_MB;
  const prevUploads = process.env.UPLOADS_DIR;
  delete process.env.MAX_UPLOAD_MB;
  delete process.env.UPLOADS_DIR;
  try {
    const cfg = buildConfig(path.resolve(__dirname, ".."));
    assert.equal(cfg.maxUploadBytes, 30 * 1024 * 1024);
    assert.match(cfg.uploadsDir.replace(/\\/g, "/"), /butler-service\/backend\/media\/uploads\/task$/);
    assert.match(cfg.legacyUploadsDir.replace(/\\/g, "/"), /ButlerService\/server\/uploads\/task$/);
  } finally {
    if (prev == null) delete process.env.MAX_UPLOAD_MB;
    else process.env.MAX_UPLOAD_MB = prev;
    if (prevUploads == null) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prevUploads;
  }
});

test("UPLOADS_DIR env overrides default uploads dir", () => {
  const prev = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = "/data/uploads/task";
  try {
    const cfg = buildConfig(path.resolve(__dirname, ".."));
    assert.equal(cfg.uploadsDir, "/data/uploads/task");
  } finally {
    if (prev == null) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prev;
  }
});
