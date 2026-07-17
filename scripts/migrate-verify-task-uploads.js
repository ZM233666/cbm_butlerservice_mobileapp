#!/usr/bin/env node
/**
 * 一次性：合并任务图片目录 + 校验 URL 是否有实体文件。
 *
 * - 默认目标：butler-service/backend/media/uploads/task（可用 UPLOADS_DIR / --target 覆盖）
 * - 源目录：目标自身 + ButlerService/server/uploads/task（历史）
 * - 同名文件：SHA-256 相同则跳过；不同则保留目标、报告冲突（不覆盖）
 * - 不删除旧目录文件
 *
 * 用法：
 *   node scripts/migrate-verify-task-uploads.js
 *   node scripts/migrate-verify-task-uploads.js --verify-only
 *   node scripts/migrate-verify-task-uploads.js --dry-run
 *   node scripts/migrate-verify-task-uploads.js --skip-db
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");

function printHelp() {
  console.log(`Usage: node scripts/migrate-verify-task-uploads.js [options]

Options:
  --verify-only      Read-only verification; do not copy files or write a report
  --dry-run          Alias of --verify-only (kept for compatibility)
  --skip-db          Skip the Django database reference check
  --target <dir>     Override the destination directory
  --source <dir>     Add a source directory (repeatable)
  --help, -h         Show this help`);
}

function parseArgs(argv) {
  const out = { dryRun: false, verifyOnly: false, skipDb: false, help: false, target: "", sources: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--verify-only") {
      out.dryRun = true;
      out.verifyOnly = true;
    }
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--skip-db") out.skipDb = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--target") {
      out.target = String(argv[++i] || "").trim();
      if (!out.target) throw new Error("--target requires a directory");
    }
    else if (a === "--source") {
      const source = String(argv[++i] || "").trim();
      if (!source) throw new Error("--source requires a directory");
      out.sources.push(source);
    }
    else throw new Error(`Unknown option: ${a}`);
  }
  return out;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith("."))
    .map((d) => d.name);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function mergeIntoTarget(targetDir, sourceDirs, { dryRun }) {
  if (!dryRun) ensureDir(targetDir);
  const summary = {
    copied: [],
    skippedSame: [],
    conflicts: [],
    sources: sourceDirs,
    target: targetDir,
  };

  for (const srcDir of sourceDirs) {
    if (!srcDir || path.resolve(srcDir) === path.resolve(targetDir)) continue;
    if (!fs.existsSync(srcDir)) {
      console.log(`[skip] source missing: ${srcDir}`);
      continue;
    }
    for (const name of listFiles(srcDir)) {
      const from = path.join(srcDir, name);
      const to = path.join(targetDir, name);
      if (!fs.existsSync(to)) {
        if (!dryRun) fs.copyFileSync(from, to);
        summary.copied.push({ name, from, to });
        continue;
      }
      const a = sha256File(from);
      const b = sha256File(to);
      if (a === b) {
        summary.skippedSame.push({ name, from, to, sha256: a });
      } else {
        summary.conflicts.push({ name, from, to, sourceSha256: a, targetSha256: b });
      }
    }
  }
  return summary;
}

function extractUploadFilenamesFromText(text) {
  const names = new Set();
  const re = /\/uploads\/task\/([^"'?\s]+)/g;
  let m;
  while ((m = re.exec(String(text || ""))) !== null) {
    const name = decodeURIComponent(m[1]).replace(/\/+$/, "");
    if (name && !name.includes("..")) names.add(path.basename(name));
  }
  return names;
}

function collectManifestUrls(manifestPath) {
  const byUrl = [];
  if (!fs.existsSync(manifestPath)) return byUrl;
  const lines = fs.readFileSync(manifestPath, "utf8").split(/\r?\n/);
  lines.forEach((line, idx) => {
    const text = line.trim();
    if (!text) return;
    let row;
    try {
      row = JSON.parse(text);
    } catch {
      return;
    }
    const urls = new Set();
    if (row.url) urls.add(String(row.url));
    if (row.publicUrl) urls.add(String(row.publicUrl));
    if (row.storedName) urls.add(`/uploads/task/${row.storedName}`);
    const uploads = row.uploads && typeof row.uploads === "object" ? row.uploads : null;
    if (uploads) {
      Object.values(uploads).forEach((meta) => {
        if (meta && typeof meta === "object" && meta.url) urls.add(String(meta.url));
      });
    }
    // payload nested
    const payload = row.payload && typeof row.payload === "object" ? row.payload : null;
    if (payload && payload.uploads && typeof payload.uploads === "object") {
      Object.values(payload.uploads).forEach((meta) => {
        if (meta && typeof meta === "object" && meta.url) urls.add(String(meta.url));
      });
    }
    urls.forEach((url) => {
      const names = extractUploadFilenamesFromText(url);
      names.forEach((name) => {
        byUrl.push({
          source: "manifest",
          line: idx + 1,
          type: row.type || "",
          url: `/uploads/task/${name}`,
          name,
          taskId: row.taskId || (payload && payload.basicInfo && payload.basicInfo.taskId) || "",
        });
      });
    });
  });
  return byUrl;
}

function collectDbMissing(targetDir, searchDirs) {
  const backendDir = path.join(workspaceRoot, "butler-service", "backend");
  const pythonCandidates = [
    path.join(backendDir, "venv", "bin", "python"),
    path.join(backendDir, ".venv", "bin", "python"),
    "python3",
  ];
  const python = pythonCandidates.find((p) => p === "python3" || fs.existsSync(p));
  if (!python) return { ok: false, error: "python_not_found", missing: [] };

  const script = `
import json, os, sys
from pathlib import Path
backend = Path(${JSON.stringify(backendDir)})
sys.path.insert(0, str(backend))
os.chdir(backend)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "application.settings")
import django
django.setup()
from TaskManagement.models import TaskSubtask

target = Path(${JSON.stringify(targetDir)})
search = [Path(p) for p in ${JSON.stringify(searchDirs)}]
missing = []

def exists(name: str) -> bool:
    for root in search:
        if (root / name).is_file():
            return True
    return (target / name).is_file()

for sub in TaskSubtask.objects.all().iterator():
    paths = sub.image_paths if isinstance(sub.image_paths, dict) else {}
    task_no = getattr(getattr(sub, "task", None), "task_no", "") or ""
    for slot, meta in paths.items():
        if not isinstance(meta, dict):
            continue
        url = str(meta.get("url") or "").strip()
        if "/uploads/task/" not in url:
            continue
        name = Path(url.split("?", 1)[0]).name
        if not name:
            continue
        if not exists(name):
            missing.append({
                "source": "db",
                "taskId": task_no,
                "subtaskId": sub.pk,
                "seq": getattr(sub, "seq_no", "") or "",
                "slot": str(slot),
                "url": f"/uploads/task/{name}",
                "name": name,
            })
print(json.dumps({"ok": True, "missing": missing}, ensure_ascii=False))
`;

  const result = spawnSync(python, ["-c", script], {
    encoding: "utf8",
    cwd: backendDir,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || "db_check_failed").slice(0, 2000),
      missing: [],
    };
  }
  try {
    const line = String(result.stdout || "")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .pop();
    return JSON.parse(line);
  } catch (err) {
    return { ok: false, error: String(err), missing: [], raw: result.stdout };
  }
}

function main() {
  require("dotenv").config({ path: path.join(projectRoot, ".env") });
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error("Run with --help for usage.");
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    printHelp();
    return;
  }

  const defaultTarget = path.resolve(
    workspaceRoot,
    "butler-service",
    "backend",
    "media",
    "uploads",
    "task"
  );
  const envTarget = String(process.env.UPLOADS_DIR || "").trim();
  const targetDir = path.resolve(
    args.target ||
      (envTarget
        ? path.isAbsolute(envTarget)
          ? envTarget
          : path.resolve(projectRoot, envTarget)
        : defaultTarget)
  );
  const legacyDir = path.join(projectRoot, "server", "uploads", "task");
  const sourceDirs = [
    ...args.sources.map((s) => path.resolve(s)),
    legacyDir,
    defaultTarget,
  ].filter((d, i, arr) => d && arr.indexOf(d) === i);

  const readOnlyLabel = args.verifyOnly ? "verify-only" : "dry-run";
  console.log(`Target: ${targetDir}${args.dryRun ? ` (${readOnlyLabel})` : ""}`);
  console.log(`Sources: ${sourceDirs.join(" | ")}`);

  const merge = mergeIntoTarget(targetDir, sourceDirs, { dryRun: args.dryRun });
  console.log(
    `Merge: ${args.dryRun ? "would_copy" : "copied"}=${merge.copied.length} same=${merge.skippedSame.length} conflicts=${merge.conflicts.length}`
  );
  if (merge.conflicts.length) {
    console.log("Conflicts (not overwritten):");
    merge.conflicts.slice(0, 50).forEach((c) => {
      console.log(`  - ${c.name}\n    src=${c.from}\n    dst=${c.to}`);
    });
  }

  const searchDirs = [targetDir, legacyDir, defaultTarget].filter(
    (d, i, arr) => d && arr.indexOf(d) === i
  );
  const fileExists = (name) => searchDirs.some((dir) => fs.existsSync(path.join(dir, name)));

  const manifestPath = path.join(projectRoot, "server", "uploads", "upload-manifest.jsonl");
  const manifestRefs = collectManifestUrls(manifestPath);
  const manifestMissing = [];
  const seen = new Set();
  for (const ref of manifestRefs) {
    if (seen.has(ref.name)) continue;
    seen.add(ref.name);
    if (!fileExists(ref.name)) manifestMissing.push(ref);
  }
  console.log(`Manifest refs: unique=${seen.size} missing_files=${manifestMissing.length}`);

  let dbMissing = [];
  let dbError = "";
  if (!args.skipDb) {
    const db = collectDbMissing(targetDir, searchDirs);
    if (!db.ok) {
      dbError = db.error || "db_check_failed";
      console.log(`DB check skipped/failed: ${dbError.slice(0, 300)}`);
    } else {
      dbMissing = db.missing || [];
      console.log(`DB missing files: ${dbMissing.length}`);
    }
  } else {
    console.log("DB check skipped (--skip-db)");
  }

  const reportPath = path.join(projectRoot, "server", "uploads", "migrate-verify-task-uploads-report.json");
  const report = {
    at: new Date().toISOString(),
    dryRun: args.dryRun,
    targetDir,
    sourceDirs,
    searchDirs,
    merge: {
      copied: merge.copied.length,
      skippedSame: merge.skippedSame.length,
      conflicts: merge.conflicts,
    },
    missing: {
      manifest: manifestMissing,
      db: dbMissing,
      dbError: dbError || undefined,
    },
  };
  if (!args.dryRun) {
    ensureDir(path.dirname(reportPath));
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Report: ${reportPath}`);
  }

  if (dbError || manifestMissing.length || dbMissing.length || merge.conflicts.length) {
    console.log("Done with findings (old files were not deleted).");
    process.exitCode = 1;
    return;
  }
  console.log("Done: no missing files, no conflicts.");
}

main();
