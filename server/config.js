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
  const uploadGeocodeAsyncRaw = String(env.UPLOAD_GEOCODE_ASYNC || "1").trim().toLowerCase();
  const uploadGeocodeAsync =
    uploadGeocodeAsyncRaw === "1" || uploadGeocodeAsyncRaw === "true" || uploadGeocodeAsyncRaw === "yes";
  const skipServerExifRaw = String(env.UPLOAD_SKIP_SERVER_EXIF || "1").trim().toLowerCase();
  const uploadSkipServerExifWhenClientGeo =
    skipServerExifRaw === "1" || skipServerExifRaw === "true" || skipServerExifRaw === "yes";
  // Canonical task images: UPLOADS_DIR, else local Django MEDIA_ROOT/uploads/task.
  // Docker sets UPLOADS_DIR=/data/uploads/task (shared volume with Django/Celery/Nginx).
  const defaultUploadsDir = path.resolve(
    projectRoot,
    "..",
    "butler-service",
    "backend",
    "media",
    "uploads",
    "task"
  );
  const legacyUploadsDir = path.join(projectRoot, "server", "uploads", "task");
  const uploadsDirRaw = String(env.UPLOADS_DIR || "").trim();
  const uploadsDir = uploadsDirRaw
    ? path.isAbsolute(uploadsDirRaw)
      ? uploadsDirRaw
      : path.resolve(projectRoot, uploadsDirRaw)
    : defaultUploadsDir;
  return {
    env: env.NODE_ENV || "development",
    host: String(env.HOST || "0.0.0.0"),
    port: toInt(env.PORT, 3100),
    bodyLimit: `${toInt(env.BODY_LIMIT_MB, 2)}mb`,
    maxUploadBytes: toInt(env.MAX_UPLOAD_MB, 30) * 1024 * 1024,
    projectRoot,
    publicDir: path.join(projectRoot, "public"),
    picSamplesDir: path.join(projectRoot, "PicSamples"),
    uploadsDir,
    legacyUploadsDir,
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
    uploadGeocodeAsync,
    uploadSkipServerExifWhenClientGeo,
    geocodeTimeoutMs: toInt(env.GEOCODE_TIMEOUT_MS, 3500),
    amapWebApiKey: String(env.AMAP_WEB_API_KEY || "").trim(),
    apiCacheHomeConfigTtlMs: toInt(env.API_CACHE_HOME_CONFIG_MS, 30_000),
    apiCacheTaskStatusTtlMs: toInt(env.API_CACHE_TASK_STATUS_MS, 15_000),
    apiCacheUserProfileTtlMs: toInt(env.API_CACHE_USER_PROFILE_MS, 300_000),
    apiCacheManagerDashboardTtlMs: toInt(env.API_CACHE_MANAGER_DASHBOARD_MS, 60_000),
    apiCacheTaskCentreTtlMs: toInt(env.API_CACHE_TASK_CENTRE_MS, 30_000),
    httpsEnabled,
    sslKeyPath: resolveFromProject(projectRoot, env.SSL_KEY_PATH, "certs/localhost-key.pem"),
    sslCertPath: resolveFromProject(projectRoot, env.SSL_CERT_PATH, "certs/localhost.pem"),
  };
}

module.exports = { buildConfig };
