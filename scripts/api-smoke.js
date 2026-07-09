#!/usr/bin/env node
/**
 * Phase 6 API-level smoke（不依赖浏览器）
 * - 本地 HMAC token（ALLOW_LOCAL_AUTH=1）→ /api/users/self
 * - 无效 token → 401
 * - 远程 Django captcha 经代理可达（不强依赖真实账号登录）
 *
 * 用法：
 *   BACKEND_URL=http://127.0.0.1:3100 npm run test:api
 */
const crypto = require("crypto");
const { spawn } = require("child_process");
const path = require("path");

const BACKEND_URL = String(process.env.BACKEND_URL || "").replace(/\/$/, "");
const AUTH_TOKEN_SECRET = String(process.env.AUTH_TOKEN_SECRET || "butler-dev-secret");
const START_SERVER = String(process.env.START_SERVER || "1").trim() !== "0";
const ROOT = path.resolve(__dirname, "..");
const SELF_PORT = String(process.env.PORT || "3110");
const SELF_URL = BACKEND_URL || `http://127.0.0.1:${SELF_PORT}`;

function issueLocalToken(employeeId, role = "fse") {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ employeeId: String(employeeId), role, iat: now, exp: now + 3600 })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_TOKEN_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

async function waitForHealth(baseUrl, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function runChecks(baseUrl) {
  let pass = 0;
  let fail = 0;
  const check = (ok, name, detail = "") => {
    if (ok) {
      pass += 1;
      console.log(`PASS: ${name}`);
    } else {
      fail += 1;
      console.log(`FAIL: ${name}${detail ? ` -> ${detail}` : ""}`);
    }
  };

  const healthRes = await fetch(`${baseUrl}/health`);
  const health = await healthRes.json().catch(() => ({}));
  check(healthRes.ok && health.ok === true, "health");

  const localToken = issueLocalToken("1", "fse");
  const selfRes = await fetch(`${baseUrl}/api/users/self`, {
    headers: { Authorization: `JWT ${localToken}`, accept: "application/json" },
  });
  const selfBody = await selfRes.json().catch(() => ({}));
  check(
    selfRes.ok && selfBody.ok === true && selfBody.user?.employeeId === "1",
    "local token /api/users/self",
    JSON.stringify(selfBody)
  );
  check(
    Array.isArray(selfBody.user?.specialWorkCertificates) &&
      selfBody.user.specialWorkCertificates.length >= 1 &&
      selfBody.user.skillLevel === "T3",
    "local profile fields (certs + skillLevel)"
  );

  const badRes = await fetch(`${baseUrl}/api/users/self`, {
    headers: { Authorization: "JWT bad-token", accept: "application/json" },
  });
  check(badRes.status === 401, "invalid token -> 401");

  // 代理链验证：只要转发到远端并拿到 Django 风格 JSON 即通过（不依赖远端 DB 空闲）
  const captchaRes = await fetch(`${baseUrl}/api/captcha/`, {
    headers: { accept: "application/json" },
  });
  const captchaBody = await captchaRes.json().catch(() => ({}));
  const proxyOk =
    captchaRes.status > 0 &&
    captchaBody &&
    typeof captchaBody === "object" &&
    ("code" in captchaBody || "msg" in captchaBody);
  check(proxyOk, "proxy /api/captcha/ -> remote Django", JSON.stringify(captchaBody).slice(0, 180));

  console.log(`SUMMARY pass=${pass} fail=${fail}`);
  return fail === 0;
}

async function main() {
  let child = null;
  const baseUrl = SELF_URL;
  try {
    if (START_SERVER) {
      child = spawn("node", ["server/server.js"], {
        cwd: ROOT,
        env: {
          ...process.env,
          ALLOW_LOCAL_AUTH: "1",
          PORT: SELF_PORT,
          HOST: "127.0.0.1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", () => {});
      child.stderr.on("data", () => {});
      const ready = await waitForHealth(baseUrl);
      if (!ready) {
        console.error("Server failed to become healthy");
        process.exit(1);
      }
    } else {
      const ready = await waitForHealth(baseUrl, 2000);
      if (!ready) {
        console.error(`Backend not reachable: ${baseUrl}`);
        process.exit(1);
      }
    }

    const ok = await runChecks(baseUrl);
    process.exit(ok ? 0 : 1);
  } finally {
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
