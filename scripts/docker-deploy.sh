#!/usr/bin/env bash
# Docker 部署脚本
# 用法：bash scripts/docker-deploy.sh
# 可选：
#   WITH_NGINX=1      同时启动 nginx 容器（80 端口）
#   WITH_NGINX_SSL=1  启动 HTTPS nginx（80→443，需证书）
#   SKIP_GIT_PULL=1   跳过 git pull

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> ButlerService Docker deploy @ $ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: 未安装 Docker"
  exit 1
fi

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    echo "ERROR: 未找到 docker compose / docker-compose"
    exit 1
  fi
fi

if [[ ! -f ".env" ]]; then
  echo "WARN: .env 不存在，从 .env.production.example 复制"
  cp .env.production.example .env
  echo "请编辑 .env 后重新执行部署（至少设置 AUTH_TOKEN_SECRET）"
fi

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]] && command -v git >/dev/null 2>&1 && [[ -d ".git" ]]; then
  echo "==> git pull"
  git pull --ff-only
fi

mkdir -p server/uploads/task server/uploads/certificates
# 共享任务图目录（与 Django MEDIA_ROOT/uploads/task、Docker /data/uploads/task 对齐）
UPLOADS_HOST="${TASK_UPLOADS_HOST_DIR:-../butler-service/backend/media/uploads/task}"
mkdir -p "$UPLOADS_HOST"

echo "==> docker build"
"${COMPOSE[@]}" build

PROFILE_ARGS=()
if [[ "${WITH_NGINX_SSL:-0}" == "1" ]]; then
  PROFILE_ARGS=(--profile with-nginx-ssl)
elif [[ "${WITH_NGINX:-0}" == "1" ]]; then
  PROFILE_ARGS=(--profile with-nginx)
fi

echo "==> docker up -d"
"${COMPOSE[@]}" "${PROFILE_ARGS[@]}" up -d

echo "==> 容器状态"
"${COMPOSE[@]}" ps

PORT="$(grep -E '^APP_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
PORT="${PORT:-3100}"

sleep 2
echo "==> 健康检查 http://127.0.0.1:${PORT}/health"
curl -fsS "http://127.0.0.1:${PORT}/health" && echo ""

echo "==> Docker 部署完成"
if [[ "${WITH_NGINX_SSL:-0}" == "1" ]]; then
  echo "    访问: https://<服务器IP>/"
elif [[ "${WITH_NGINX:-0}" == "1" ]]; then
  echo "    访问: http://<服务器IP>/"
else
  echo "    访问: http://<服务器IP>:${PORT}/"
fi
