# Server Dashboard Detail Drawer Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有服务端 Dashboard 左侧 session 列表和接口不变的前提下，把右侧详情抽屉升级成更接近本地记录工作台的“结构化详情 + 原始 JSON”体验。

**Architecture:** 只改 Dashboard 前端壳层，不改后端 API 和 repository。`server/views/dashboard.html` 负责抽屉结构骨架，`server/public/dashboard.css` 负责卡片化与层级优化，`server/public/dashboard.js` 负责把已有 session/action 数据映射成结构化详情块，并保留底部原始 JSON 兜底视图。

**Tech Stack:** Server-rendered HTML, vanilla JavaScript, CSS, Node test runner

---

## File Structure

- `server/views/dashboard.html`
  负责 Dashboard 静态结构；本次只调整右侧抽屉内部结构，不动左侧 session 表格和顶部筛选区。
- `server/public/dashboard.css`
  负责 Dashboard 页面样式；本次新增抽屉内部卡片、详情网格、选中态、字段摘要行等样式。
- `server/public/dashboard.js`
  负责 Dashboard 客户端交互；本次重构右侧详情渲染逻辑，把 action 详情拆成基础信息卡、附件信息卡和原始 JSON 区。
- `tests/server/dashboard-ui.test.js`
  负责 Dashboard UI 壳层与脚本轻量校验；本次扩展测试，锁定新的详情抽屉结构和客户端渲染入口。

## Chunk 1: Lock the Enhanced Drawer Contract with Tests

### Task 1: Extend the dashboard shell tests for the new drawer structure

**Files:**
- Modify: `tests/server/dashboard-ui.test.js`
- Modify: `server/views/dashboard.html`

- [ ] **Step 1: Write the failing test**

补充壳层断言：
- 抽屉中存在 `session summary` 区块
- 抽屉中存在 `structured action detail` 区块
- 原始 JSON 仍保留在底部
- 动作详情和附件详情不再只依赖单个文本块

建议新增或更新断言目标：
- `id="sessionSummary"`
- `id="actionFacts"`
- `id="attachmentFacts"`
- `id="actionDetail"`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: FAIL because the current drawer shell only has `drawerMeta`, `attachmentSummary`, preview area, and raw JSON.

- [ ] **Step 3: Commit the red test**

```bash
git add tests/server/dashboard-ui.test.js
git commit -m "test: lock dashboard enhanced drawer shell"
```

### Task 2: Extend client script tests for structured detail rendering hooks

**Files:**
- Modify: `tests/server/dashboard-ui.test.js`
- Modify: `server/public/dashboard.js`

- [ ] **Step 1: Write the failing test**

补充脚本断言，要求客户端存在：
- session 摘要渲染入口
- action 基础信息渲染入口
- action 附件详情渲染入口
- 原始 JSON 渲染仍保留

建议锁定关键标识：
- `renderSessionSummary`
- `renderActionFacts`
- `renderAttachmentFacts`
- `actionDetail`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: FAIL because the current script still以 `buildDrawerMeta`、`renderAttachmentDetail`、`renderActionJson` 的旧结构为主。

- [ ] **Step 3: Commit the red test**

```bash
git add tests/server/dashboard-ui.test.js
git commit -m "test: cover dashboard structured detail renderers"
```

## Chunk 2: Rebuild the Drawer Shell

### Task 3: Replace the old drawer body with sectioned detail blocks

**Files:**
- Modify: `server/views/dashboard.html`
- Modify: `tests/server/dashboard-ui.test.js`

- [ ] **Step 1: Add the session summary section**

在抽屉头部下方，把旧 `drawerMeta` 纯文本区域替换或包裹成结构化摘要区：
- 标题可继续沿用 `Session Detail`
- 新增 `sessionSummary` 容器，供脚本注入卡片内容

- [ ] **Step 2: Add the structured action detail section**

在动作列表下方新增详情区骨架：
- `actionFacts`
- `attachmentFacts`
- 保留 `attachmentPreview`
- 保留 `actionDetail`

要求：原始 JSON 区仍在抽屉底部，结构化详情在其上方。

- [ ] **Step 3: Run focused tests**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/views/dashboard.html tests/server/dashboard-ui.test.js
git commit -m "feat: restructure dashboard detail drawer shell"
```

## Chunk 3: Align the Drawer Visual Language with the Local Records Workbench

### Task 4: Add card-based drawer styling and denser selected-action presentation

**Files:**
- Modify: `server/public/dashboard.css`
- Modify: `tests/server/dashboard-ui.test.js`

- [ ] **Step 1: Add the failing style assertions if needed**

如果现有测试不足以锁定新样式结构，补充断言：
- `.detail-section`
- `.detail-grid`
- `.detail-card`
- `.detail-item`
- `.action-item.is-selected`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: FAIL because the current CSS only covers the old drawer blocks and basic action item state.

- [ ] **Step 3: Write the minimal drawer styling**

在 `server/public/dashboard.css` 中实现：
- session summary 卡片样式
- action 基础信息 / 附件信息卡片样式
- 更明显的 action 选中态
- 更紧凑的字段展示网格
- 保留移动端下抽屉退化行为

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/public/dashboard.css tests/server/dashboard-ui.test.js
git commit -m "feat: style dashboard drawer as structured cards"
```

## Chunk 4: Rebuild the Detail Rendering Logic

### Task 5: Render session summary as structured facts instead of a text block

**Files:**
- Modify: `server/public/dashboard.js`
- Modify: `tests/server/dashboard-ui.test.js`

- [ ] **Step 1: Write the failing test**

锁定脚本中存在 session 摘要渲染逻辑，至少覆盖：
- `sessionId`
- `startedAt`
- `endedAt`
- `actionCount`
- `tags`
- sync 摘要
- `lastUrl`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: FAIL because the current `buildDrawerMeta` still返回拼接文本。

- [ ] **Step 3: Write minimal implementation**

把 `buildDrawerMeta` 替换为结构化 HTML 渲染函数，例如：
- `renderSessionSummary(session)`

要求：
- 缺失字段统一回退为 `-`
- 标签仍复用现有 tag 样式

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/public/dashboard.js tests/server/dashboard-ui.test.js
git commit -m "feat: render dashboard session summary as structured facts"
```

### Task 6: Render selected action details as basic facts plus attachment facts

**Files:**
- Modify: `server/public/dashboard.js`
- Modify: `tests/server/dashboard-ui.test.js`

- [ ] **Step 1: Write the failing test**

锁定客户端具备以下渲染入口：
- `renderActionFacts`
- `renderAttachmentFacts`

并覆盖基础字段来源：
- `type`
- `timestamp`
- `sync.status`
- `page.url`
- `page.title`
- `target.selector`
- `target.text`
- `payload.value`
- `payload.key`

附件字段至少覆盖：
- DOM status / preview
- screenshot status
- remote status
- capture error
- upload error
- uploadedAt
- size

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: FAIL because the current detail area still only渲染附件摘要文本和原始 JSON。

- [ ] **Step 3: Write minimal implementation**

在 `server/public/dashboard.js` 中：
- 新增 `renderActionFacts(action)`
- 新增 `renderAttachmentFacts(action)`
- 在 `updateSelectedActionUI()` 中统一调用
- 保留 `renderAttachmentPreview()` 和 `renderActionJson()` 作为现有兜底能力

- [ ] **Step 4: Keep deletion and selection behavior stable**

确认以下行为不回归：
- 点击 action 项仍能切换详情
- 删除当前 action 后能自动刷新抽屉
- 无 action 时详情区能回到占位态

- [ ] **Step 5: Run focused tests**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/public/dashboard.js tests/server/dashboard-ui.test.js
git commit -m "feat: render structured dashboard action details"
```

## Chunk 5: Verification

### Task 7: Run final verification for the dashboard enhancement

**Files:**
- Verify only

- [ ] **Step 1: Run the focused dashboard UI tests**

Run: `npm.cmd test -- tests/server/dashboard-ui.test.js`
Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm.cmd test`
Expected: PASS with zero failures.

- [ ] **Step 3: Manual smoke-check the dashboard**

验证：
1. 打开 `/dashboard`
2. 点击任一 session 打开右侧抽屉
3. 确认顶部展示结构化 session 摘要
4. 点击任一 action，确认出现结构化基础信息卡和附件信息卡
5. 底部仍能看到原始 JSON
6. 截图预览、删除 action、删除 session、导出按钮仍可操作

