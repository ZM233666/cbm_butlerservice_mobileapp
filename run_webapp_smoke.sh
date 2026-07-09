#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENV_PYTHON="${ROOT_DIR}/.venv/bin/python"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5174}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3100}"
# 烟测依赖本地 HMAC token
export ALLOW_LOCAL_AUTH="${ALLOW_LOCAL_AUTH:-1}"
export AUTH_TOKEN_SECRET="${AUTH_TOKEN_SECRET:-butler-dev-secret}"

if [[ ! -x "${VENV_PYTHON}" ]]; then
  echo "未找到虚拟环境 Python: ${VENV_PYTHON}"
  echo "请先在 /Users/God-Prime/Desktop/H5Projects 下创建 .venv。"
  exit 1
fi

if ! curl -sf "${FRONTEND_URL}/" >/dev/null; then
  echo "前端开发服务未启动：请先运行 ButlerService/frontend 下的 npm run dev"
  echo "当前期望地址: ${FRONTEND_URL}"
  exit 1
fi

if ! curl -sf "${BACKEND_URL}/health" >/dev/null; then
  echo "后端服务未启动：请先运行 ButlerService 下的 npm start"
  echo "当前期望地址: ${BACKEND_URL}"
  exit 1
fi

echo "开始执行 Web App 冒烟测试..."
FRONTEND_URL="${FRONTEND_URL}" BACKEND_URL="${BACKEND_URL}" "${VENV_PYTHON}" "${SCRIPT_DIR}/webapp_smoke.py"
