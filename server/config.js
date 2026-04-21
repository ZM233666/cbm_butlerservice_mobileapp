const path = require("path");

function toInt(value, fallback) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolveFromProject(projectRoot, maybePath, fallbackRelPath) {
  const rel = maybePath && String(maybePath).trim() ? String(maybePath).trim() : fallbackRelPath;
  return path.isAbsolute(rel) ? rel : path.join(projectRoot, rel);
}

function buildConfig(projectRoot) {
  const env = process.env;
  const httpsEnabledRaw = String(env.HTTPS_ENABLED || "").trim().toLowerCase();
  const httpsEnabled = httpsEnabledRaw === "1" || httpsEnabledRaw === "true" || httpsEnabledRaw === "yes";
  const reverseGeocodeRaw = String(env.REVERSE_GEOCODE_ENABLED || "1").trim().toLowerCase();
  const reverseGeocodeEnabled =
    reverseGeocodeRaw === "1" || reverseGeocodeRaw === "true" || reverseGeocodeRaw === "yes";
  return {
    env: env.NODE_ENV || "development",
    host: String(env.HOST || "0.0.0.0"),
    port: toInt(env.PORT, 3100),
    bodyLimit: `${toInt(env.BODY_LIMIT_MB, 2)}mb`,
    maxUploadBytes: toInt(env.MAX_UPLOAD_MB, 20) * 1024 * 1024,
    projectRoot,
    publicDir: path.join(projectRoot, "public"),
    picSamplesDir: path.join(projectRoot, "PicSamples"),
    uploadsDir: path.join(projectRoot, "server", "uploads", "task"),
    certUploadsDir: path.join(projectRoot, "server", "uploads", "certificates"),
    manifestPath: path.join(projectRoot, "server", "uploads", "upload-manifest.jsonl"),
    recordsDataPath: resolveFromProject(projectRoot, env.RECORDS_DATA_PATH, "server/data/records.json"),
    tasksDataPath: resolveFromProject(
      projectRoot,
      env.TASKS_DATA_PATH,
      "public/data/brake-guidance-tasks.json"
    ),
    homeConfigPath: resolveFromProject(projectRoot, env.HOME_CONFIG_PATH, "server/data/home-config.json"),
    taskStatusPath: resolveFromProject(projectRoot, env.TASK_STATUS_PATH, "server/data/task-status.json"),
    taskEditRequestPath: resolveFromProject(
      projectRoot,
      env.TASK_EDIT_REQUEST_PATH,
      "server/data/task-edit-requests.jsonl"
    ),
    managerAssignmentsPath: resolveFromProject(
      projectRoot,
      env.MANAGER_ASSIGNMENTS_PATH,
      "server/data/manager-assignments.json"
    ),
    usersDataPath: resolveFromProject(projectRoot, env.USERS_DATA_PATH, "server/data/users.json"),
    recommendationsPath: resolveFromProject(
      projectRoot,
      env.RECOMMENDATIONS_DATA_PATH,
      "server/data/recommendations.json"
    ),
    reverseGeocodeEnabled,
    geocodeTimeoutMs: toInt(env.GEOCODE_TIMEOUT_MS, 3500),
    amapWebApiKey: String(env.AMAP_WEB_API_KEY || "").trim(),
    httpsEnabled,
    sslKeyPath: resolveFromProject(projectRoot, env.SSL_KEY_PATH, "certs/localhost-key.pem"),
    sslCertPath: resolveFromProject(projectRoot, env.SSL_CERT_PATH, "certs/localhost.pem"),
  };
}

module.exports = { buildConfig };
