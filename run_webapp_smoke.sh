#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENV_PYTHON="${ROOT_DIR}/.venv/bin/python"

if [[ ! -x "${VENV_PYTHON}" ]]; then
  echo "未找到虚拟环境 Python: ${VENV_PYTHON}"
  echo "请先在 /Users/God-Prime/Desktop/H5Projects 下创建 .venv。"
  exit 1
fi

if ! curl -sf "http://127.0.0.1:5173/" >/dev/null; then
  echo "前端开发服务未启动：请先运行 ButlerService/frontend 下的 npm run dev"
  exit 1
fi

if ! curl -skf "https://127.0.0.1:3100/health" >/dev/null; then
  echo "后端 HTTPS 服务未启动：请先运行 ButlerService 下的 npm run start:https"
  exit 1
fi

echo "开始执行 Web App 冒烟测试..."
"${VENV_PYTHON}" "${SCRIPT_DIR}/webapp_smoke.py"
