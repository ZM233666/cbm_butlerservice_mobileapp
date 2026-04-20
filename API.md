# ButlerService 接口文档（按前端模块）

> 说明：本文档按前端页面/模块组织，便于联调。  
> 除登录接口外，其余 `/api/*` 均需携带 `Authorization: Bearer <token>`。

---

## 0. 通用约定

### 0.1 Base URL

- 本地：`https://127.0.0.1:3100`
- 局域网：启动日志里输出的 `https://<LAN_IP>:3100`

### 0.2 鉴权

- 登录成功后会返回 `token`
- 后续请求需带 Header：

```http
Authorization: Bearer <token>
```

相关环境变量：
- `AUTH_TOKEN_SECRET`：签名密钥（生产环境必配）
- `AUTH_TOKEN_EXPIRE_SEC`：过期秒数（默认 43200）

### 0.3 通用响应

- 成功：`{ "ok": true, ... }`
- 失败：`{ "ok": false, "error": "<code>" }`

常见错误码：
- `400` 参数错误（如 `employee_id_required`、`status_invalid`）
- `401` 未登录/鉴权失败（`unauthorized`、`invalid_credentials`）
- `403` 越权（`forbidden`）
- `404` 资源不存在（如 `work_order_not_found`）
- `409` 资源冲突（`recommendation_already_claimed`）

---

## 1. 用户登录（LoginView）

### 1.1 用户登录

**接口**：`POST /api/users/login`

**请求参数（JSON）**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `username` | string | 是 | 用户名 |
| `employeeId` | string | 是 | 工号 |
| `email` | string | 是 | 邮箱 |
| `role` | string | 是 | `fse` / `manager` |
| `department` | string | 否 | 预留 |

**请求示例**：

```json
{
  "username": "Zhen Miao",
  "employeeId": "1",
  "email": "1@com",
  "role": "fse",
  "department": ""
}
```

**成功响应**：

```json
{
  "ok": true,
  "user": {
    "employeeId": "1",
    "username": "Zhen Miao",
    "email": "1@com",
    "department": "",
    "role": "fse",
    "updatedAt": "2026-04-17T00:00:00.000Z"
  },
  "token": "<bearer_token>",
  "isNewUser": false
}
```

---

## 2. Home 模块

---

### 2.1 ACTION TASKS（ActionTasks）

#### 2.1.1 获取首页任务卡

**接口**：`GET /api/home-config?employeeId=<id>`

**用途**：首页 ACTION TASKS 列表 + 推荐列表。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `employeeId` | string | 是 | 当前登录用户工号 |

**返回字段（tasks 节选）**：

| 字段 | 说明 |
|---|---|
| `maint` | 修程（`c1c3` / `c4c6`） |
| `title` | 任务名称 |
| `meta` | 来源标签（如 `Regional Manager`、`CBM AI`） |
| `deadline` | 截止日期 |
| `taskId` | 主任务 ID |
| `depot` | 服务地点 |
| `uploadProgress` | `{ uploaded, required, percent }`，用于已完成任务显示上传比例 |

#### 2.1.2 获取任务状态（To Do/Doing/Done）

**接口**：`GET /api/task-status?employeeId=<id>`

#### 2.1.3 更新任务状态

**接口**：`POST /api/task-status`

**请求参数（JSON）**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `employeeId` | string | 是 | 工号 |
| `maint` | string | 是 | `c1c3/c4c6` |
| `status` | string | 是 | `todo/doing/done` |
| `taskKey` | string | 否 | 前端任务 key |
| `taskId` | string | 否 | 主任务 ID（建议传） |
| `title` | string | 否 | 兼容旧 key |
| `deadline` | string | 否 | 兼容旧 key |

---

### 2.2 CBM RECOMMENDATIONS（CbmRecommendations）

#### 2.2.1 查询推荐列表

**接口**：`GET /api/recommendations?employeeId=<id>`

> 仅 `fse` 可调用，且只能查询本人。

#### 2.2.2 接受推荐（生成工单）

**接口**：`POST /api/recommendations/:id/accept`

**路径参数**：
- `id`：推荐 ID

**请求参数（JSON）**：

```json
{ "employeeId": "1" }
```

**成功响应（节选）**：

```json
{
  "ok": true,
  "accepted": true,
  "recommendationId": "REC-CCBII-0001",
  "workOrder": {
    "id": "MT-CCBII-88425",
    "source": "cbm_ai",
    "status": "todo"
  }
}
```

**冲突响应**（已被他人抢占）：

```json
{ "ok": false, "error": "recommendation_already_claimed" }
```

---

### 2.3 大区经理看板（ManagerDashboard）

#### 2.3.1 获取看板数据

**接口**：`GET /api/manager/dashboard?month=YYYY-MM`

> 仅 `manager` 可调用。

#### 2.3.2 经理派发任务

**接口**：`POST /api/manager/assignments`

> 仅 `manager` 可调用。  
> 内部复用工单创建逻辑，与 `/api/work-orders` 数据源一致。

**请求参数（JSON）**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignedToEmployeeId` | string | 是 | 指派的 FSE 工号 |
| `maint` | string | 是 | 修程 |
| `vehicleNo` | string | 是 | 车辆号 |
| `deadline` | string | 是 | 截止日期 |
| `createdBy` | object | 否 | 会被后端按当前登录经理覆盖 |

---

## 3. Task List 模块（TaskListView）

### 3.1 上传照片

**接口**：`POST /api/upload`（`multipart/form-data`）

**Form 字段**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `file` | file | 是 | 图片 |
| `slotId` | string | 是 | 子任务上传槽位 |
| `clientDisplayName` | string | 否 | 展示名称 |
| `clientCapturedAt` | string | 否 | 客户端拍摄时间 |
| `clientLatitude` | number/string | 否 | 纬度 |
| `clientLongitude` | number/string | 否 | 经度 |
| `clientLocationAccuracy` | number/string | 否 | 定位精度 |

### 3.2 提交任务

**接口**：`POST /api/task-submit`

**用途**：保存任务提交快照（写入 `upload-manifest.jsonl`），用于后续统计上传完成比例。

### 3.3 编辑申请

**接口**：`POST /api/task-edit-request`

**请求参数（JSON）**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `employeeId` | string | 是 | 当前 FSE 工号（必须本人） |
| `maint` | string | 是 | 修程 |
| `reason` | string | 是 | 申请原因 |
| `taskId` | string | 否 | 任务 ID |

---

## 4. Task Centre 模块（TaskCenterView）

### 4.1 创建工单（FSE 自建 / 经理创建）

**接口**：`POST /api/work-orders`

**权限规则**：
- `manager`：可给任意 FSE 创建
- `fse`：只能给自己创建（`assignedToEmployeeId` 必须是本人）

**请求参数（JSON）**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignedToEmployeeId` | string | 是 | 指派对象 |
| `maint` | string | 是 | 修程 |
| `vehicleNo` | string | 是 | 车辆号 |
| `deadline` | string | 是 | 截止日期 |
| `title` | string | 否 | 标题 |
| `depot` | string | 否 | 服务地点 |

### 4.2 更新工单状态

**接口**：`POST /api/work-orders/:id/status`

**请求参数（JSON）**：

```json
{ "status": "doing" }
```

**权限规则**：
- `manager` 可更新任意工单
- `fse` 仅可更新指派给自己的工单

### 4.3 查询工单

**接口**：`GET /api/work-orders`

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assigneeId` | string | 否 | 指派工号 |
| `status` | string | 否 | `todo/doing/done` |
| `month` | string | 否 | `YYYY-MM` |
| `maint` | string | 否 | 修程 |

### 4.4 工单统计

**接口**：`GET /api/work-orders/stats`

**Query 参数**：同 `GET /api/work-orders`

---

## 5. Fault Searching 模块（RecordsView）

### 5.1 模糊搜索历史记录

**接口**：`GET /api/records?keyword=<q>&limit=<n>`

**说明**：对以下字段合并后做模糊匹配（includes）：
- `id`, `code`, `taskSeq`, `trainNo`, `maintType`, `date`, `desc`

**Query 参数**：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `keyword` | string | 是 | 搜索关键词 |
| `limit` | number | 否 | 返回条数上限，默认 50，最大 200 |

---

## 6. 其它接口

### 6.1 任务摘要

**接口**：`GET /api/task-summary`

### 6.2 查询用户（管理）

**接口**：`GET /api/users`

> 仅 `manager` 可调用。

### 6.3 新增/更新用户（调试）

**接口**：`POST /api/users`

> 仅 `manager` 可调用。

### 6.4 健康检查

**接口**：`GET /health`

# ButlerService 接口文档（联调版）

> 说明：本项目为 H5 联调与演示用途，采用本地 JSON 作为“模拟数据库”。
>
> - **通用响应风格**：多数接口返回 `{ "ok": true, ... }`；校验失败返回 `4xx` 且 `{ "ok": false, "error": "<code>" }`
> - **HTTPS**：开发时常用 `npm run start:https`（自签证书）

## 基础地址

- **本地**：`https://127.0.0.1:3100`
- **LAN**：启动日志里会打印 `https://<ip>:3100`

## 鉴权说明（新增）

- 除 `POST /api/users/login` 外，其余 `/api/*` 接口均需要：
  - `Authorization: Bearer <token>`
- `token` 由登录接口返回，服务端会校验签名、过期时间、用户与角色一致性。
- 相关环境变量：
  - `AUTH_TOKEN_SECRET`：签名密钥（生产环境必须配置）
  - `AUTH_TOKEN_EXPIRE_SEC`：token 过期秒数（默认 43200 秒）
- 常见鉴权错误：
  - `401 { "ok": false, "error": "unauthorized" }`
  - `403 { "ok": false, "error": "forbidden" }`

## 常见错误码（建议前端统一处理）

| HTTP | error | 说明 |
|---:|---|---|
| 400 | `employee_id_required` / `maint_invalid` / `status_invalid` / `reason_required`... | 请求参数不合法 |
| 401 | `invalid_credentials` / `unauthorized` | 登录失败 / token 缺失或无效 |
| 403 | `forbidden` | 有 token 但越权 |
| 404 | `recommendation_not_found` / `work_order_not_found` | 资源不存在 |
| 409 | `recommendation_already_claimed` | 推荐已被其他人先接收 |
| 413 | `file_too_large` | 上传文件过大 |
| 500 | `internal_error` | 服务端异常 |

## 1. 健康检查

### 1.1 服务健康检查

**接口**：`GET /health`

**成功响应**：

```json
{
  "ok": true,
  "service": "ButlerService",
  "env": "development",
  "now": "2026-04-17T00:00:00.000Z"
}
```

---

## 2. 用户管理（模拟数据库）

> 数据文件：`server/data/users.json`
>
> 当前默认内置用户：
> - FSE：`username=Zhen Miao`, `employeeId=1`, `email=1@com`, `role=fse`
> - 大区经理：`username=Zhen Miao`, `employeeId=2`, `email=2@com`, `role=manager`

### 2.1 登录（必须校验信息）

**接口**：`POST /api/users/login`

**请求 Body**：

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `username` | string | 是 | 姓名 |
| `employeeId` | string | 是 | 工号 |
| `email` | string | 是 | 邮箱 |
| `role` | string | 是 | `fse` / `manager` |
| `department` | string | 否 | 部门（预留） |

**请求示例**：

```json
{
  "username": "Zhen Miao",
  "employeeId": "1",
  "email": "1@com",
  "role": "fse",
  "department": ""
}
```

**成功响应**（200）：

```json
{
  "ok": true,
  "user": {
    "employeeId": "1",
    "username": "Zhen Miao",
    "email": "1@com",
    "department": "",
    "role": "fse",
    "updatedAt": "2026-04-17T00:00:00.000Z"
  },
  "token": "<bearer_token>",
  "isNewUser": false
}
```

**失败响应**（401）：

```json
{ "ok": false, "error": "invalid_credentials" }
```

### 2.2 查询用户列表

**接口**：`GET /api/users`
> 仅 `manager` 可调用

**Query 参数**：

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `role` | string | 否 | `fse` / `manager` |
| `employeeId` | string | 否 | 精确匹配工号 |

**成功响应**：

```json
{ "ok": true, "total": 2, "users": [/* ... */] }
```

### 2.3 新增/更新用户（调试用）

**接口**：`POST /api/users`
> 仅 `manager` 可调用

> 注意：此接口用于调试，`/api/users/login` 不会自动注册用户。

---

## 3. 工单（Work Orders）

> 工单库文件：`server/data/manager-assignments.json`（字段名沿用 assignments）
>
> 工单状态：
> - `todo`：待办（刚派发/刚生成）
> - `doing`：进行中（已接受/开始执行）
> - `done`：已完成（提交完成）

### 3.1 查询工单列表

**接口**：`GET /api/work-orders`

**Query 参数**：

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assigneeId` | string | 否 | 指派给谁（工号） |
| `status` | string | 否 | `todo/doing/done` |
| `month` | string | 否 | `YYYY-MM`（按 deadline 或 createdAt 归属月份） |
| `maint` | string | 否 | `c1c3` / `c4c6` |

**成功响应**：

```json
{ "ok": true, "total": 4, "rows": [/* assignments */] }
```

### 3.2 创建工单（指派/自建均用此接口）

**接口**：`POST /api/work-orders`
> 权限规则：
> - `manager`：可为任意 FSE 创建
> - `fse`：仅允许 `assignedToEmployeeId` 等于自己

**请求 Body**：

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignedToEmployeeId` | string | 是 | 指派给的 FSE 工号 |
| `maint` | string | 是 | `c1c3` / `c4c6` |
| `vehicleNo` | string | 是 | 车辆编号 |
| `deadline` | string | 是 | `YYYY-MM-DD` |
| `title` | string | 否 | 标题 |
| `depot` | string | 否 | 服务地点/段所 |
| `createdBy` | object | 否 | `{ employeeId, name }` |

**成功响应**（201）：

```json
{ "ok": true, "workOrder": { "id": "wo_...", "status": "todo" } }
```

### 3.3 派发/改派工单

**接口**：`POST /api/work-orders/:id/dispatch`
> 仅 `manager` 可调用

**请求 Body**：

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignedToEmployeeId` | string | 是 | 新的 FSE 工号 |
| `maint` / `deadline` / `vehicleNo` / `title` / `depot` | string | 否 | 可选补丁字段 |

**成功响应**：

```json
{ "ok": true, "workOrder": { "id": "MT-...", "status": "todo" } }
```

### 3.4 更新工单状态

**接口**：`POST /api/work-orders/:id/status`
> 权限规则：
> - `manager`：可更新任意工单
> - `fse`：仅可更新指派给自己的工单

**请求 Body**：

```json
{ "status": "doing" }
```

---

## 4. 任务状态（Task Status）

> 数据文件：`server/data/task-status.json`
>
> 说明：H5 任务页（TaskList）会调用该接口更新 `todo/doing/done`；
> 后端会尝试将同 `taskId` 的工单同步到 `server/data/manager-assignments.json`。

### 4.1 获取某个员工的任务状态表

**接口**：`GET /api/task-status?employeeId=1`

**成功响应**：

```json
{ "ok": true, "employeeId": "1", "statuses": { "MT-CCBII-88421": { "status": "todo" } } }
```

### 4.2 更新任务状态（Accept/Save/Submit 会触发）

**接口**：`POST /api/task-status`

**请求 Body（核心字段）**：

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `employeeId` | string | 是 | 工号 |
| `maint` | string | 是 | `c1c3/c4c6` |
| `status` | string | 是 | `todo/doing/done` |
| `taskKey` | string | 否 | 前端用于存储的 key |
| `taskId` | string | 否 | 主任务 ID（推荐传） |
| `title` | string | 否 | 标题（用于兼容旧 key） |
| `deadline` | string | 否 | 截止（用于兼容旧 key） |

---

## 5. 首页配置（Action Tasks + CBM Recommendations）

### 5.1 获取首页任务卡/推荐卡

**接口**：`GET /api/home-config?employeeId=1`

**说明**：
- `tasks`：合并静态 `home-config.json` 与“工单库”后得到的任务卡；同 `taskId` 时以工单库为准
- `recommendations`：来自 `server/data/recommendations.json`，并按用户维度过滤已接受项
- `uploadProgress`：仅对工单库任务卡计算（Done 时用于展示 `uploaded/required`）

**响应示例（节选）**：

```json
{
  "ok": true,
  "tasks": [
    {
      "maint": "c1c3",
      "title": "C1/C3",
      "meta": "Regional Manager",
      "deadline": "2026-04-22",
      "taskId": "MT-CCBII-88424",
      "depot": "Shanghai",
      "href": "/task-list?maint=c1c3",
      "uploadProgress": { "uploaded": 0, "required": 19, "percent": 0 }
    }
  ],
  "recommendations": [
    {
      "id": "REC-CCBII-0001",
      "maint": "c4c6",
      "title": "C4/C6",
      "meta": "CBM AI",
      "depot": "Suzhou",
      "deadline": "2026-04-28",
      "taskId": "MT-CCBII-88425",
      "href": "/task-list?maint=c4c6"
    }
  ]
}
```

---

## 6. CBM Recommendations（推荐库 + 接受推荐生成工单）

> 推荐库文件：`server/data/recommendations.json`

### 6.1 查询推荐

**接口**：`GET /api/recommendations?employeeId=1`
> 仅 `fse` 且仅允许查询本人

**成功响应**：

```json
{ "ok": true, "total": 2, "rows": [ { "id": "REC-CCBII-0001", "maint": "c4c6", "title": "C4/C6" } ] }
```

### 6.2 接受推荐（生成工单，来源 CBM AI）

**接口**：`POST /api/recommendations/:id/accept`
> 仅 `fse` 且仅允许 `employeeId` 为本人

**请求 Body**：

```json
{ "employeeId": "1" }
```

**成功响应**（201，节选）：

```json
{
  "ok": true,
  "accepted": true,
  "recommendationId": "REC-CCBII-0001",
  "workOrder": {
    "id": "MT-CCBII-88425",
    "source": "cbm_ai",
    "status": "todo"
  }
}
```

**冲突响应**（409）：

```json
{ "ok": false, "error": "recommendation_already_claimed" }
```

---

## 7. 上传与提交（TaskList）

### 7.1 上传图片

**接口**：`POST /api/upload`（multipart/form-data）

**Form 字段**：
- `file`：图片文件
- `slotId`：子任务 slot（如 `r1-LOCO`）
- `clientDisplayName`（可选）
- 可选的拍摄时间/定位信息（用于元数据）

### 7.2 提交任务

**接口**：`POST /api/task-submit`

**说明**：当前会将提交内容写入 `server/uploads/upload-manifest.jsonl`（type=submit），供 `uploadProgress` 统计使用。

---

## 8. 维修记录查询（Fault Searching）

> 数据文件：`server/data/records.json`

### 8.1 模糊搜索

**接口**：`GET /api/records?keyword=<q>&limit=50`

**说明**：对 `id/code/taskSeq/trainNo/maintType/date/desc` 合并字符串做 `includes()` 模糊匹配。

**成功响应**：

```json
{ "ok": true, "total": 10, "rows": [/* ... */] }
```

---

## 9. 大区经理看板

### 9.1 看板数据

**接口**：`GET /api/manager/dashboard?month=YYYY-MM`

### 9.2 经理派发工单（兼容入口）

**接口**：`POST /api/manager/assignments`

> 说明：内部实际调用工单创建逻辑，写入与 `/api/work-orders` 同一数据源。

