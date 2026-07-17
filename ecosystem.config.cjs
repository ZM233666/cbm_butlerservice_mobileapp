const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const clusterWorkers = Number.parseInt(process.env.NODE_CLUSTER_WORKERS || "8", 10);
const instances = Number.isFinite(clusterWorkers) && clusterWorkers > 0 ? Math.min(clusterWorkers, 16) : 8;

module.exports = {
  apps: [
    {
      name: "butler-service",
      cwd: __dirname,
      script: "server/server.js",
      instances,
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "384M",
      time: true,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 3100,
        UPLOADS_DIR: process.env.UPLOADS_DIR || "/srv/butler-data/uploads/task",
        MAX_UPLOAD_MB: process.env.MAX_UPLOAD_MB || "30",
      },
      error_file: path.join(__dirname, "logs", "pm2-error.log"),
      out_file: path.join(__dirname, "logs", "pm2-out.log"),
      merge_logs: true,
    },
  ],
};
