const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// 使用 cluster.js 单实例 fork：由 Node primary 管理 worker 数，并做认证上游全局协调。
// 勿再对 server.js 开 PM2 cluster，否则无法跨进程合并/限流。
module.exports = {
  apps: [
    {
      name: "butler-service",
      cwd: __dirname,
      script: "server/cluster.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "384M",
      time: true,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 3100,
        NODE_CLUSTER_ENABLED: "1",
        NODE_CLUSTER_WORKERS: process.env.NODE_CLUSTER_WORKERS || "8",
        UPLOADS_DIR: process.env.UPLOADS_DIR || "/srv/butler-data/uploads/task",
        MAX_UPLOAD_MB: process.env.MAX_UPLOAD_MB || "30",
        AUTH_UPSTREAM_MAX_CONCURRENCY: process.env.AUTH_UPSTREAM_MAX_CONCURRENCY || "16",
        AUTH_UPSTREAM_QUEUE_MAX: process.env.AUTH_UPSTREAM_QUEUE_MAX || "64",
        AUTH_UPSTREAM_QUEUE_WAIT_MS: process.env.AUTH_UPSTREAM_QUEUE_WAIT_MS || "3000",
      },
      error_file: path.join(__dirname, "logs", "pm2-error.log"),
      out_file: path.join(__dirname, "logs", "pm2-out.log"),
      merge_logs: true,
    },
  ],
};
