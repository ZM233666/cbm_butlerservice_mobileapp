# ButlerService（CBM Butler Service Mobile App）

ButlerService 项目的接口联调与开发文档入口。

## 文档与接口

- **Swagger / OpenAPI（后端接口文档）**：`http://117.62.232.51:8004/`
- **OpenAPI Schema（机器可读）**：
  - `http://117.62.232.51:8004/swagger.json`
  - `http://117.62.232.51:8004/swagger.yaml`
- **项目接口约定（按前端模块整理）**：`API.md`
- **开发记录/对齐说明**：`DevelopDoc.md`

## 鉴权约定（重要）

除登录/验证码接口外，其余 `/api/*` 请求通常需要携带：

```http
Authorization: JWT <access>
```

并建议在示例与联调脚本中显式声明：

```http
accept: application/json
```

JSON 请求再加：

```http
Content-Type: application/json
```

## 本地启动

### 后端（Node / Express）

在项目根目录（`ButlerService/`）：

```bash
npm i
cp .env.example .env
npm run start
```

局域网可访问（监听 `0.0.0.0`）：

```bash
npm run start:lan
```

如需 HTTPS（会读取 `.env` 里的证书配置）：

```bash
npm run start:https
```

默认端口为 **3100**（可在 `.env` 中通过 `PORT` 修改）。

### 前端（Vite + Vue 3）

在 `ButlerService/frontend/`：

```bash
npm i
npm run dev
```

## Cursor Skill（已内置到项目）

项目包含一个用于联调/实现接口的 Skill：

- `butler-snippets-api`：当你让 Agent “use butler-snippets-api” 时，会优先参考 `API.md` 与在线 OpenAPI，并输出带 `accept`/`Content-Type`/`Authorization` 的可运行示例。

Skill 文件位置：

- `.cursor/skills/butler-snippets-api/SKILL.md`
