#!/usr/bin/env bash
# ButlerService 生产部署脚本
# 用法（在项目根目录）：
#   bash scripts/deploy.sh
# 可选环境变量：
#   SKIP_GIT_PULL=1   跳过 git pull
#   SKIP_TESTS=1      跳过 npm test

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> ButlerService deploy @ $ROOT"

if [[ ! -f ".env" ]]; then
  if [[ -f ".env.production.example" ]]; then
    echo "WARN: .env 不存在，已从 .env.production.example 复制，请检查配置"
    cp .env.production.example .env
  else
    echo "ERROR: 缺少 .env，请先创建配置文件"
    exit 1
  fi
fi

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]] && command -v git >/dev/null 2>&1 && [[ -d ".git" ]]; then
  echo "==> git pull"
  git pull --ff-only
fi

mkdir -p logs

echo "==> 安装后端依赖"
if [[ -f package-lock.json ]]; then
  npm ci --omit=dev
else
  npm i --omit=dev
fi

echo "==> 构建前端"
cd frontend
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm i
fi
npm run build
cd "$ROOT"

echo "==> 校验数据文件"
npm run validate:data

if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
  echo "==> 运行测试"
  npm test
fi

echo "==> 启动/重载 PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  echo "ERROR: 未安装 pm2，请先执行: npm i -g pm2"
  exit 1
fi

if pm2 describe butler-service >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

PORT="$(grep -E '^PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
PORT="${PORT:-3100}"

echo "==> 健康检查 http://127.0.0.1:${PORT}/health"
sleep 1
curl -fsS "http://127.0.0.1:${PORT}/health" && echo ""

echo "==> 部署完成"
echo "    本地: http://127.0.0.1:${PORT}"
echo "    PM2:  pm2 status / pm2 logs butler-service"
