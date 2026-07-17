#!/bin/sh
set -e

mkdir -p server/uploads/task server/uploads/certificates
# Docker 共享任务图目录（UPLOADS_DIR=/data/uploads/task）
if [ -n "${UPLOADS_DIR:-}" ]; then
  mkdir -p "$UPLOADS_DIR"
fi
mkdir -p /data/uploads/task 2>/dev/null || true

exec node server/cluster.js
