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

## 任务图片存储

任务图片对外统一使用以下 URL，不在数据库中保存服务器绝对路径：

```text
/uploads/task/<文件名>
```

### 本地开发

新上传图片统一写入 Django 的媒体目录：

```text
butler-service/backend/media/uploads/task
```

从 `ButlerService/` 项目看，对应的相对配置为：

```env
UPLOADS_DIR=../butler-service/backend/media/uploads/task
```

旧版图片目录 `ButlerService/server/uploads/task` 仅用于兼容读取，新的任务图片不再写入该目录。

### 服务器部署

当 ButlerService、Django 和 Celery 部署在同一台服务器时，建议使用独立的宿主机持久化目录：

```text
/srv/butler-data/uploads/task
```

两套项目的部署环境统一设置：

```env
TASK_UPLOADS_HOST_DIR=/srv/butler-data/uploads/task
```

容器内路径映射如下：

```text
ButlerService Node / Nginx: /data/uploads/task
Django / Celery:             /backend/media/uploads/task
```

以上路径指向同一个宿主机目录，确保网页显示、任务提交和报告生成读取同一份图片。该目录必须作为持久化 volume 挂载，不能随容器重新部署而删除。

服务器首次部署前创建目录并配置权限：

```bash
sudo mkdir -p /srv/butler-data/uploads/task
sudo chown -R 1000:1000 /srv/butler-data
```

上传限制统一为：前端、Node、Django `30MB`，Nginx `32MB`。如果 ButlerService 与 Django 部署在不同服务器，不能使用本地共享目录，应改用对象存储、NFS，或统一由 Django 接收和提供图片。

## Cursor Skill（已内置到项目）

项目包含一个用于联调/实现接口的 Skill：

- `butler-snippets-api`：当你让 Agent “use butler-snippets-api” 时，会优先参考 `API.md` 与在线 OpenAPI，并输出带 `accept`/`Content-Type`/`Authorization` 的可运行示例。

Skill 文件位置：

- `.cursor/skills/butler-snippets-api/SKILL.md`
