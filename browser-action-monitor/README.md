# Browser Action Monitor

浏览器操作监控工具，用于记录用户在网页上的操作，并将数据保存为适合 Agent / AI 训练使用的结构化格式。

当前版本支持：

- 本地浏览器操作采集
- 本地会话记录与查看
- 可选远程同步
- 可选固定 API Key 鉴权
- 隐私保护开关
- Agent JSON / Agent ZIP 导出
- 服务端 Dashboard 查看与管理
- 后台补偿 V2：多会话并发补偿、指数退避、空闲态感知、电量感知

## 目录结构

```text
browser-action-monitor/
├─ background.js
├─ content.js
├─ popup.html
├─ options.html
├─ records.html
├─ manifest.json
├─ src/
├─ server/
├─ scripts/
├─ tests/
└─ docs/
```

## 运行要求

- Node.js 18+
- Chrome / Chromium

## 安装依赖

```bash
npm install
```

## 启动服务端

默认启动：

```bash
npm run start:server
```

前台启动：

```bash
npm run start:server:foreground
```

常用管理命令：

```bash
npm run server:status
npm run server:stop
npm run server:restart
```

Dashboard 默认地址：

```text
http://127.0.0.1:3000/dashboard
```

### 服务端环境变量

- `PORT`: 服务端端口，默认 `3000`
- `DATA_DIR`: 数据目录
- `AUTH_MODE`: `none` 或 `apiKey`
- `API_KEY`: 当 `AUTH_MODE=apiKey` 时使用

### API Key 鉴权启动示例

```powershell
$env:PORT="3000"
$env:AUTH_MODE="apiKey"
$env:API_KEY="demo-key"
npm run start:server
```

## 公共 API

服务端现有接口已经可以直接对外复用，不需要额外开启第二套 API。

- 接口文档：`docs/api.md`
- 健康检查：`GET /health`
- 数据接口前缀：`/api/*`
- 当 `AUTH_MODE=apiKey` 时，所有 `/api/*` 都需要：
  - `X-API-Key: <key>`
  - 或 `Authorization: Bearer <key>`

最常用的读取接口包括：

- `GET /api/sessions`
- `GET /api/sessions/:sessionId`
- `GET /api/sessions/:sessionId/export`
- `GET /api/tags`
- `GET /api/attachments/:sessionId/:actionId`

## 加载扩展

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择目录 `D:\docker\webdata\browser-action-monitor`

## 使用说明

### Popup

Popup 里可以直接进行这些操作：

- 开始/暂停记录
- 查看当前会话统计
- 打开记录页
- 导出普通 JSON
- 导出 Agent JSON
- 导出 Agent ZIP
- 手动触发同步
- 清空本地数据
- 打开设置页

### 设置页

设置页支持以下配置：

- 采集事件开关
- 滚动 / 鼠标移动节流
- 隐私保护开关
- 服务端地址
- 鉴权模式
- API Key
- 单批上传动作数
- 后台自动补偿开关
- 自动补偿间隔
- 启动时补偿
- 会话并发上限
- 指数退避开关
- 最大退避时长
- 空闲态感知开关
- 电量感知开关

### 隐私保护

- 开启时：对输入值和敏感字段优先做脱敏
- 关闭时：按原始值记录，适合受控测试环境

### 远程同步

- `serverUrl` 留空时：只做本地记录，不会上报
- `authMode=none`：不鉴权
- `authMode=apiKey`：请求头带 `X-API-Key`

## 后台补偿 V2

后台补偿 V2 的目标，是在不打断用户正常使用浏览器的情况下，自动把历史未同步的数据补传上去。

### 行为说明

- 自动扫描所有本地 session
- 只处理仍存在 `pending` 或 `failed` 动作的 session
- 自动跳过正在同步中的 session
- 可同时同步多个 session，但受并发上限限制
- 某个 session 失败不会中断整轮补偿

### 指数退避

当某个 session 同步失败时，会记录：

- `consecutiveFailureCount`
- `lastFailedSyncAt`
- `nextRetryAt`

成功后会自动重置退避状态：

- `consecutiveFailureCount` 归零
- `nextRetryAt` 清空
- `lastSuccessfulSyncAt` 更新

### 空闲态感知

仅影响自动触发的补偿流程：

- 浏览器处于 `active` 时：并发降为 `1`
- 浏览器处于 `idle` / `locked` 时：按配置并发运行
- 手动重试不受限制

### 电量感知

电量感知为尽力而为：

- 如果运行环境支持电量信息，会在低电量时跳过本轮自动补偿
- 如果运行环境不支持电量信息，会自动退化为只看空闲态
- 手动重试不受电量限制

## Agent 导出

支持两种 Agent 导出格式：

- `Agent JSON`
- `Agent ZIP`

导出内容包含：

- `rawSteps`
- `playwright.rawLikeSteps`
- `playwright.executableSteps`
- `playwright.script`
- `summary.tasks`

服务端支持：

- 单会话 Agent 导出
- 多会话批量 Agent 导出

## 服务端 Dashboard

Dashboard 提供：

- 会话列表
- 操作明细查看
- 搜索与筛选
- 标签管理
- 单条 action 删除
- 单会话 / 批量导出
- 单会话 / 批量删除

## 服务端 API

### 基础接口

- `GET /health`
- `GET /dashboard`
- `POST /api/actions/batch`
- `GET /api/sessions`
- `GET /api/sessions/:sessionId`
- `GET /api/tags`
- `PATCH /api/sessions/:sessionId/tags`
- `DELETE /api/sessions/:sessionId`
- `DELETE /api/actions/:actionId`
- `POST /api/sessions/bulk/tags`
- `POST /api/sessions/bulk/export`
- `POST /api/sessions/bulk/delete`

### Agent 导出接口

- `GET /api/sessions/:sessionId/export?format=json&type=agent`
- `GET /api/sessions/:sessionId/export?format=zip&type=agent`
- `POST /api/sessions/bulk/export-agent`

### 健康检查

`GET /health` 返回：

- `authMode`
- `version`
- `features.agentExport`

## 测试

运行全部测试：

```bash
npm test
```

## 已知后续项

延后到后续版本的内容记录在：

- [docs/v2-backlog.md](./docs/v2-backlog.md)

## 动作附件

当前版本已支持为 action 附加：

- `DOM 快照`
- `动作截图`

### 附件采集规则

- DOM 快照默认开启
- 动作截图默认开启
- DOM 快照先写入 action
- 截图异步补采，不阻塞动作入库
- 截图会单独存储，不直接塞进主 action 列表

### 隐私保护

- 开启隐私保护时，DOM 快照会按现有规则脱敏
- 截图会保留隐私模式元数据
- 如果截图无法安全处理，会回退到 DOM 快照状态

### 大数据量保护

当队列、存储或失败率接近阈值时：

- 先自动关闭截图采集
- 压力继续升高时再自动关闭 DOM 快照
- 核心 action 记录不会停止

Popup 中可查看：

- DOM 快照当前状态
- 截图采集当前状态
- 截图队列长度
- 附件存储字节数

### 记录页

`records.html` 现在支持：

- 查看每条记录的附件摘要
- 查看 DOM 快照摘要
- 查看本地截图预览
- 区分 `DOM` / `SHOT` / `DOM + SHOT` / 失败或跳过状态

### 远程附件上传

远程同步现在分两段：

1. 先同步 session 和 action 元数据
2. 再单独上传截图附件

新增服务端接口：

- `POST /api/sessions/:sessionId/actions/:actionId/attachments/screenshot`
- `GET /api/attachments/:sessionId/:actionId`
