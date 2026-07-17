const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const script = path.resolve(__dirname, "../scripts/migrate-verify-task-uploads.js");

test("migration help exits without running migration", () => {
  const result = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--verify-only/);
  assert.doesNotMatch(result.stdout, /Target:/);
});

test("verify-only mode does not create the target directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "butler-upload-verify-only-"));
  const source = path.join(root, "source");
  const target = path.join(root, "missing-target");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "photo.jpg"), "source");
  try {
    const result = spawnSync(
      process.execPath,
      [script, "--verify-only", "--skip-db", "--target", target, "--source", source],
      { encoding: "utf8" },
    );
    assert.match(result.stdout, /\(verify-only\)/);
    assert.match(result.stdout, /would_copy=/);
    assert.equal(fs.existsSync(target), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("unknown migration options fail with usage exit code", () => {
  const result = spawnSync(process.execPath, [script, "--unknown"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown option/);
});

test("migration exits non-zero when a filename conflict is found", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "butler-upload-migration-"));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  fs.mkdirSync(source);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(source, "conflict.jpg"), "source");
  fs.writeFileSync(path.join(target, "conflict.jpg"), "target");
  try {
    const result = spawnSync(
      process.execPath,
      [script, "--dry-run", "--skip-db", "--target", target, "--source", source],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /conflicts=1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migration exits non-zero when the required database check fails", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "butler-upload-db-check-"));
  try {
    const result = spawnSync(process.execPath, [script, "--dry-run", "--target", root], {
      encoding: "utf8",
      env: { ...process.env, DJANGO_SETTINGS_MODULE: "missing.settings" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /DB check skipped\/failed:/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
