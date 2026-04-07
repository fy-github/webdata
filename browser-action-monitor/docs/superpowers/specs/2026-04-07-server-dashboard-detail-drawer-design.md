# Server Dashboard Detail Drawer Enhancement Design

Date: 2026-04-07

## Context

服务端 Dashboard 已经具备这些能力：

- 左侧 `session` 列表
- 右侧详情抽屉
- 单会话导出、删除、标签编辑
- 会话内动作列表
- 附件摘要和截图预览
- 原始 action JSON 查看

当前问题不在于功能缺失，而在于右侧详情抽屉的信息组织方式偏“技术调试页”：

- 单条动作详情以原始 JSON 为主
- 高频字段没有被结构化抬出来
- 附件信息、页面信息、目标元素信息分散
- 和本地记录工作台相比，查看单条记录的效率明显偏低

本次目标已经确认：

- 保留现有“左侧 session 列表 + 右侧详情抽屉”的主结构
- 参考本地记录工作台的页面风格和详情组织方式
- 重点增强“查看单条动作详情”的体验
- 采用“结构化详情卡片 + 底部原始 JSON”的方式，而不是继续以 JSON 为主

## Goals

- 优化服务端 Dashboard 右侧详情抽屉的可读性和信息层级
- 让用户查看单条动作详情时，不需要先读整段 JSON
- 把高频字段组织成结构化卡片，提升人工巡检和核对效率
- 保留原始 JSON 作为排查兜底能力
- 让抽屉的视觉和交互更接近本地记录工作台

## Non-Goals

- 不重做左侧 session 列表
- 不改 Dashboard 路由结构
- 不新增后端数据模型
- 不新增新的服务端 API
- 不把整个 Dashboard 改造成与本地记录工作台完全一致的双栏页面
- 不在本次加入分页、排序、折叠树或复杂 diff 视图

## Confirmed Product Direction

- 采用“详情抽屉增强型”方案
- 保留现有左侧 `session` 列表和批量操作区
- 右侧抽屉改成分区式详情结构
- 单条动作详情优先结构化展示
- 原始 JSON 保留在底部

## High-Level Architecture

本次只改三层：

1. `server/views/dashboard.html`
   - 调整抽屉内部的结构骨架
2. `server/public/dashboard.css`
   - 重做抽屉内部的视觉层级和卡片布局
3. `server/public/dashboard.js`
   - 重新组织选中 action 的渲染逻辑，把已有数据映射成结构化详情视图

后端接口和存储仓库保持不变。也就是说，本次是纯前端呈现重构，不引入新的数据依赖。

## Layout Strategy

### Keep the Existing Outer Shell

保留以下部分不变：

- 顶部工具栏
- 筛选区
- 批量操作条
- 左侧 `session` 表格
- 点击 `session` 后打开右侧抽屉的交互模式

这样可以把风险集中在右侧详情面板，避免无关区域回归。

### Enhanced Drawer Structure

右侧抽屉改成 4 个主要块，从上到下依次为：

1. `Session 摘要`
2. `动作列表`
3. `单条动作详情`
4. `原始 JSON`

这与本地记录工作台的“列表 + 详情 + 附件 + 原始数据”思路保持一致，但保留 Dashboard 的 session 视角。

## Drawer Content Design

### 1. Session Summary

抽屉头部保留当前标题和关闭按钮，但把原本的 `drawerMeta` 升级为结构化摘要块，展示：

- `sessionId`
- `startedAt`
- `endedAt`
- `actionCount`
- `tags`
- `pending / failed` 同步概况
- `lastUrl`

表现方式应接近本地记录工作台的 summary card，而不是一大段拼接文本。

### 2. Action List

动作列表仍放在抽屉中部，但每条 action 改成更紧凑、信息密度更高的“记录项”样式。

每条至少展示：

- 时间
- 类型
- 目标摘要
- 附件状态标签

要求：

- 选中态明显
- 点击整个 action 项即可切换详情
- `Inspect` 按钮可保留，但不再是唯一入口
- `Delete` 操作继续保留

这部分应更接近本地记录工作台左侧结果区的浏览体验。

### 3. Structured Action Detail

这是本次的核心改造区域。

选中单条 action 后，详情区优先展示结构化卡片，而不是先展示 JSON。

建议拆成两个卡片块：

#### Basic Detail Card

展示高频字段：

- `type`
- `timestamp`
- `sync.status`
- `page.url`
- `page.title`
- `target.selector`
- `target.text`
- `target.tagName`
- `payload.value / payload.key` 的可读摘要

要求：

- 缺失字段安全回退为 `-`
- URL 和长文本可换行，但关键字段不要挤成一大段
- 同步状态继续使用 pill/tag 风格表达

#### Attachment Detail Card

展示附件相关信息：

- DOM 快照状态
- DOM 预览摘要
- 截图状态
- 远程上传状态
- 截图错误
- 上传错误
- 已上传时间
- 截图尺寸
- 截图预览

保持已有远程截图预览逻辑不变，但把状态说明改成更结构化的说明块。

### 4. Raw JSON

原始 JSON 继续保留在详情区底部，作为排查兜底。

要求：

- 标题明确为 `Action JSON`
- 不再作为详情区第一主视图
- 仍使用 `<pre>` 渲染，避免破坏开发者调试能力

## Visual Direction

本次视觉方向参考本地记录工作台，但不完全复制：

- 抽屉内信息采用更多分区卡片
- 标题层级更明确
- 辅助说明文字减少
- 状态采用 pill/chip 呈现
- 附件信息和基础信息分开表达
- 选中项背景和边界更明显

保留当前 Dashboard 的蓝白基础配色，不引入新的品牌风格。

## Data Mapping Rules

本次不改 API，只改已有数据到 UI 的映射方式。

### Session-Level Mapping

来自 `state.currentSession.session`：

- `sessionId`
- `startedAt`
- `endedAt`
- `actionCount`
- `lastUrl`
- `tags`
- `sync.pendingCount`
- `sync.failedCount`

### Action-Level Mapping

来自 `state.currentSession.actions[*]`：

- 基础动作字段
- `page`
- `target`
- `payload`
- `sync`
- `attachment.domSnapshot`
- `attachment.screenshot`

### Attachment Preview Mapping

继续沿用：

- `remoteUrl` 存在：直接展示远程截图
- `failed_privacy_guard`：展示隐私保护说明
- 无远程截图但有 DOM 预览：展示 DOM fallback 文案
- 其他情况：展示当前截图状态说明

## Error Handling

- 未选中 action 时，结构化详情区显示明确占位文案
- 某些字段缺失时，不渲染异常文本，统一回退为 `-`
- 附件缺失时，附件卡片仍展示状态，但不报错
- 删除 action 后，如果当前 action 被删除：
  - 自动选中下一条 action
  - 若无剩余 action，则清空详情区
- 删除 session 后，关闭抽屉并恢复默认占位

## File Boundaries

### Modify

- `server/views/dashboard.html`
- `server/public/dashboard.css`
- `server/public/dashboard.js`
- `tests/server/dashboard-ui.test.js`

### No Backend Changes Required

- `server/app.js`
- `server/repository.js`
- `/api/sessions/:sessionId`
- `/api/attachments/:sessionId/:actionId`

这些都不应在本次修改。

## Testing Strategy

### UI Shell Tests

更新 `tests/server/dashboard-ui.test.js`，锁定：

- 抽屉中存在新的结构化详情区域
- 保留原始 JSON 区域
- 详情区存在基础信息和附件信息块
- 动作项仍保留选中和附件状态显示能力

### Client Script Tests

继续保持轻量测试风格，只验证：

- 详情渲染逻辑包含基础详情块
- 附件详情渲染逻辑包含结构化字段
- 原始 JSON 区域仍保留

### Verification

- `npm.cmd test -- tests/server/dashboard-ui.test.js`
- `npm.cmd test`

## Recommendation

按“详情抽屉增强型”实施：保留当前 Dashboard 外层结构，仅重构右侧抽屉的信息组织方式。这样可以以最低风险显著提升单条动作详情的可读性，并与本地记录工作台形成更一致的使用体验，而不会引入新的服务端接口和存储复杂度。
