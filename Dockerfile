# ---- 前端构建 ----
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---- 生产运行 ----
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3100

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public
COPY PicSamples ./PicSamples
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN chmod +x ./scripts/docker-entrypoint.sh \
  && mkdir -p server/uploads/task server/uploads/certificates

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
