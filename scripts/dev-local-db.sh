#!/usr/bin/env bash
# 本地联调：Django :8005 + Node :3100（TASK_DATA_SOURCE=db）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DJANGO_ROOT="$(cd "$ROOT/../butler-service/backend" && pwd)"
DJANGO_PORT="${DJANGO_PORT:-8005}"
NODE_PORT="${PORT:-3100}"

if [[ ! -x "$DJANGO_ROOT/venv/bin/uvicorn" ]]; then
  echo "缺少 Django venv：$DJANGO_ROOT/venv"
  echo "请先：cd butler-service/backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt"
  exit 1
fi

if ! lsof -i ":$DJANGO_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "启动 Django API http://127.0.0.1:$DJANGO_PORT ..."
  (cd "$DJANGO_ROOT" && ./venv/bin/uvicorn application.asgi:application --host 127.0.0.1 --port "$DJANGO_PORT") &
  DJANGO_PID=$!
  trap 'kill "$DJANGO_PID" 2>/dev/null || true' EXIT
  sleep 1
else
  echo "Django 已在端口 $DJANGO_PORT 监听，跳过启动"
fi

if lsof -i ":$NODE_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "警告：端口 $NODE_PORT 已被占用，请先停止旧 Node 进程再运行"
  exit 1
fi

echo "启动 Node http://127.0.0.1:$NODE_PORT （.env: TASK_DATA_SOURCE=db）"
cd "$ROOT"
exec npm run dev:db
