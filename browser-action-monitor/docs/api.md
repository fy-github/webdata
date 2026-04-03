# 服务端公共 API 文档

本文档描述 Browser Action Monitor 服务端当前对外可复用的 API。本文档复用现有接口路径，不引入新的 `/api/v1` 前缀。

## 1. 认证方式

服务端支持两种认证模式，由启动参数决定：

- `AUTH_MODE=none`
  - 所有现有接口都可匿名访问
- `AUTH_MODE=apiKey`
  - 所有 `/api/*` 路径都需要携带 API Key
  - `GET /health` 仍然允许匿名访问，方便健康检查

可用的认证头有两种：

```http
X-API-Key: your-api-key
```

或：

```http
Authorization: Bearer your-api-key
```

## 2. 相关环境变量

- `PORT`
  - 服务监听端口，默认 `3000`
- `DATA_DIR`
  - 服务端数据目录
- `AUTH_MODE`
  - `none` 或 `apiKey`
- `API_KEY`
  - 当 `AUTH_MODE=apiKey` 时生效

## 3. 错误响应格式

所有 `/api/*` 的错误响应统一为 JSON：

```json
{
  "error": "Session not found",
  "code": "not_found",
  "details": {}
}
```

当前使用的 `code` 包括：

- `unauthorized`
- `invalid_payload`
- `not_found`
- `unsupported_format`

常见 HTTP 状态码映射：

- `400`：请求参数或请求体不合法
- `401`：缺少认证或 API Key 错误
- `404`：资源不存在

## 4. 健康检查

### `GET /health`

用于服务探活和版本检查，不要求 API Key。

示例：

```bash
curl http://127.0.0.1:3000/health
```

示例响应：

```json
{
  "ok": true,
  "authMode": "apiKey",
  "version": "1.0.0",
  "features": {
    "agentExport": true
  }
}
```

## 5. 只读数据接口

### `GET /api/tags`

获取当前服务端已经存在的标签列表。

示例：

```bash
curl -H "X-API-Key: your-api-key" \
  http://127.0.0.1:3000/api/tags
```

示例响应：

```json
{
  "tags": ["checkout", "training"]
}
```

### `GET /api/sessions`

分页获取会话列表。

支持的查询参数：

- `q`
  - 关键字，匹配 `sessionId`、`lastUrl` 和标签
- `tag`
  - 精确标签过滤
- `status`
  - 会话状态过滤
- `dateFrom`
  - 开始时间下限，毫秒时间戳
- `dateTo`
  - 开始时间上限，毫秒时间戳
- `page`
  - 页码
- `pageSize`
  - 每页数量

示例：

```bash
curl -H "X-API-Key: your-api-key" \
  "http://127.0.0.1:3000/api/sessions?q=checkout&tag=checkout&page=1&pageSize=10"
```

示例响应：

```json
{
  "total": 1,
  "page": 1,
  "pageSize": 10,
  "sessions": [
    {
      "sessionId": "ses_checkout",
      "startedAt": 100,
      "endedAt": 100,
      "status": "active",
      "actionCount": 1,
      "lastUrl": "https://example.com/checkout",
      "tags": ["checkout"],
      "sync": {
        "enabled": false,
        "pendingCount": 1,
        "failedCount": 0,
        "lastSyncedAt": null,
        "lastError": ""
      },
      "management": {
        "createdAt": 100,
        "updatedAt": 100
      }
    }
  ]
}
```

### `GET /api/sessions/:sessionId`

获取单个会话及其动作明细。

示例：

```bash
curl -H "X-API-Key: your-api-key" \
  http://127.0.0.1:3000/api/sessions/ses_checkout
```

示例响应：

```json
{
  "session": {
    "sessionId": "ses_checkout",
    "startedAt": 100,
    "endedAt": 100,
    "status": "active",
    "actionCount": 1,
    "lastUrl": "https://example.com/checkout",
    "tags": ["checkout"]
  },
  "actions": [
    {
      "id": "act_ses_checkout",
      "sessionId": "ses_checkout",
      "type": "click",
      "timestamp": 100,
      "page": {
        "url": "https://example.com/checkout",
        "title": "Example"
      }
    }
  ]
}
```

### `GET /api/attachments/:sessionId/:actionId`

获取某个动作已上传到服务端的截图附件。

成功时返回图片二进制，不是 JSON。

示例：

```bash
curl -H "X-API-Key: your-api-key" \
  http://127.0.0.1:3000/api/attachments/ses_attach_api/act_attach_api \
  --output attachment.jpg
```

失败时返回标准错误 JSON，例如：

```json
{
  "error": "Attachment not found",
  "code": "not_found",
  "details": {}
}
```

## 6. 导出接口

### `GET /api/sessions/:sessionId/export`

导出单个会话。支持普通导出和 agent 导出。

查询参数：

- `format`
  - `json` 或 `zip`
- `type`
  - 省略或空字符串：普通导出
  - `agent`：agent 导出

#### 普通 JSON 导出

```bash
curl -H "X-API-Key: your-api-key" \
  "http://127.0.0.1:3000/api/sessions/ses_123/export?format=json"
```

返回普通会话 JSON。

#### 普通 ZIP 导出

```bash
curl -H "X-API-Key: your-api-key" \
  "http://127.0.0.1:3000/api/sessions/ses_123/export?format=zip" \
  --output ses_123-export.zip
```

返回 ZIP 文件，内部包含：

- `session.json`
- `attachments/...`（如果服务端存在截图附件）

#### Agent JSON 导出

```bash
curl -H "X-API-Key: your-api-key" \
  "http://127.0.0.1:3000/api/sessions/ses_123/export?format=json&type=agent"
```

#### Agent ZIP 导出

```bash
curl -H "X-API-Key: your-api-key" \
  "http://127.0.0.1:3000/api/sessions/ses_123/export?format=zip&type=agent" \
  --output ses_123-agent-export.zip
```

当 `format` 不支持时，返回：

```json
{
  "error": "Unsupported export format",
  "code": "unsupported_format",
  "details": {}
}
```

## 7. 写入与管理接口

以下接口也复用现有路径，文档列出供外部系统接入时参考。

### `POST /api/actions/batch`

批量写入会话和动作数据。

### `POST /api/sessions/:sessionId/actions/:actionId/attachments/screenshot`

上传某个动作的截图附件。

### `PATCH /api/sessions/:sessionId/tags`

更新单个会话标签。

### `DELETE /api/sessions/:sessionId`

删除单个会话。

### `DELETE /api/actions/:actionId`

删除单个动作。

### Bulk 管理接口

- `POST /api/sessions/bulk/tags`
- `POST /api/sessions/bulk/export`
- `POST /api/sessions/bulk/export-agent`
- `POST /api/sessions/bulk/delete`

## 8. 常用 curl 示例

### 获取会话列表

```bash
curl -H "X-API-Key: your-api-key" \
  "http://127.0.0.1:3000/api/sessions?page=1&pageSize=20"
```

### 获取单个会话详情

```bash
curl -H "X-API-Key: your-api-key" \
  http://127.0.0.1:3000/api/sessions/ses_123
```

### 导出单个会话 ZIP

```bash
curl -H "X-API-Key: your-api-key" \
  "http://127.0.0.1:3000/api/sessions/ses_123/export?format=zip" \
  --output ses_123-export.zip
```

### 获取动作截图附件

```bash
curl -H "X-API-Key: your-api-key" \
  http://127.0.0.1:3000/api/attachments/ses_123/act_456 \
  --output act_456.jpg
```
