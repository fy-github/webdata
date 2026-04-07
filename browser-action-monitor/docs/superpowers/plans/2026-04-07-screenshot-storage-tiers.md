# Screenshot Storage Tiers Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将截图附件从 `chrome.storage.local` 的小配额存储升级为基于 `IndexedDB` 的分级存储方案，并在设置页提供可选的截图存储档位，同时保留本地与服务端双份截图数据。

**Architecture:** 保持现有“动作元数据在 `chrome.storage.local`、截图字节单独存储”的整体结构不变，但把截图字节改为优先写入 `IndexedDB`，并通过一个统一的截图存储门面兼容读取旧 `dataUrl` 记录。截图策略不再直接依赖可编辑的 `screenshotStorageLimitMb`，而是由固定档位推导出 `storageLimitMb`、`jpegQuality` 与 `maxWidth`，并在档位升级时仅对 `disabled_auto_quota` 做自动恢复。

**Tech Stack:** Chrome Extension Manifest V3, Service Worker, IndexedDB, Plain HTML/CSS/JS, Node test runner

---

## File Structure

- `manifest.json`
  负责扩展权限声明；本次为截图本地大容量保存增加 `unlimitedStorage`。
- `src/extension/shared/constants.js`
  负责默认设置与共享常量；本次新增截图档位定义、默认档位、档位解析辅助常量。
- `src/extension/background/screenshot-policy.js`
  负责截图压力判断与启停策略；本次改为基于档位推导容量阈值，并补充“仅自动停用可自动恢复”的纯函数。
- `src/extension/background/attachment-store.js`
  负责截图附件存储门面；本次改为优先读写 `IndexedDB`，并保留旧 `chrome.storage.local` 附件的兼容读取与清理入口。
- `src/extension/background/attachment-indexeddb.js`
  新建；封装 `IndexedDB` 的打开、按 `actionId` 读写、统计容量、批量清理。
- `src/extension/background/screenshot-capture.js`
  新建；封装截图档位到 `captureVisibleTab` 参数、必要的压缩/缩放，以及统一返回 `dataUrl + sizeBytes + dimensions`。
- `background.js`
  负责扩展后台初始化、消息分发、附件基础设施装配、设置保存、清空数据；本次接入新的截图档位、存储门面、自动恢复逻辑和附件清空逻辑。
- `options.html`
  负责设置页结构；本次增加截图档位选择与档位说明，移除冗余的“直接按 MB 配置”心智。
- `src/ui/options.js`
  负责设置页读写；本次保存和回填 `screenshotStorageProfile`，并展示档位联动说明。
- `src/ui/records.js`
  负责记录工作台截图预览；本次只在读取链路变化时做兼容校验，避免 `IndexedDB` 切换后预览失效。
- `README.md`
  负责中文使用说明；本次补充截图档位、本地双份保存、自动停用/恢复、清空数据范围。
- `tests/background/screenshot-policy.test.js`
  新建；锁定截图档位阈值、自动停用、自动恢复、手动关闭不恢复的规则。
- `tests/background/attachment-store.test.js`
  扩展；锁定 `IndexedDB` 读写、容量统计、旧数据兼容读取与批量清理。
- `tests/background/screenshot-capture.test.js`
  新建；锁定档位到截图压缩参数与缩放行为的映射。
- `tests/background/attachment-queue.test.js`
  扩展；锁定队列与新截图门面的对接、存储字节回填、容量失败后停用行为。
- `tests/background/sync.test.js`
  扩展；锁定截图附件在新存储门面下仍可上传到服务端，且缺失本地字节时仍返回既有失败码。
- `tests/ui/options-attachments.test.js`
  扩展；锁定设置页截图档位的结构、默认值、保存回填。
- `tests/ui/records-attachments.test.js`
  扩展；锁定记录工作台仍通过 `getActionAttachmentPreview` 读取截图预览。

## Chunk 1: Lock the Tier Contract with Tests

### Task 1: Add profile and recovery policy tests

**Files:**
- Create: `tests/background/screenshot-policy.test.js`
- Modify: `src/extension/shared/constants.js`
- Modify: `src/extension/background/screenshot-policy.js`

- [ ] **Step 1: Write the failing test**

覆盖以下规则：
- `DEFAULT_SETTINGS.screenshotStorageProfile === "balanced"`
- 三个档位分别解析为 `64 MB / 0.55 / 1280`、`256 MB / 0.72 / 1600`、`1024 MB / 0.86 / 1920`
- 达到当前档位容量上限时返回 `autoDisabled.screenshots = true` 且原因为 `storage-pressure`
- 手动关闭截图时模式保持 `disabled_manual`
- 仅当旧状态是 `disabled_auto_quota` 且切换到更高档位后当前占用低于新上限时，恢复截图采集

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/background/screenshot-policy.test.js`
Expected: FAIL because the codebase still uses `screenshotStorageLimitMb: 8`, has no profile map, and has no auto-recovery helper.

- [ ] **Step 3: Commit the red test**

```bash
git add tests/background/screenshot-policy.test.js
git commit -m "test: lock screenshot storage profile policy"
```

### Task 2: Extend settings UI tests for screenshot profiles

**Files:**
- Modify: `tests/ui/options-attachments.test.js`
- Modify: `options.html`
- Modify: `src/ui/options.js`

- [ ] **Step 1: Write the failing test**

补充断言：
- 设置页存在 `screenshotStorageProfile`
- 默认回填为 `balanced`
- 用户切换到 `light` 或 `forensics` 后，`saveSettings` 消息带上 `screenshotStorageProfile`
- 页面包含三档中文说明文字，而不是暴露一个自由输入的 MB 字段

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/ui/options-attachments.test.js`
Expected: FAIL because the settings page currently exposes only `captureDomSnapshots` and `captureScreenshots`.

- [ ] **Step 3: Commit the red test**

```bash
git add tests/ui/options-attachments.test.js
git commit -m "test: cover screenshot profile settings ui"
```

### Task 3: Extend attachment storage tests for IndexedDB and legacy fallback

**Files:**
- Modify: `tests/background/attachment-store.test.js`
- Modify: `src/extension/background/attachment-store.js`
- Create: `src/extension/background/attachment-indexeddb.js`

- [ ] **Step 1: Write the failing test**

补充场景：
- `IndexedDB` 存储适配器可按 `actionId` 保存、读取、删除截图
- `getAttachmentUsage` 返回 `IndexedDB` 的总字节数与记录数
- 当新存储未命中时，可回退读取旧 `monitorAttachment:*` 记录
- `clearAllAttachments` 会同时清掉新 `IndexedDB` 和旧兼容记录

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/background/attachment-store.test.js`
Expected: FAIL because there is no `IndexedDB` adapter, no compatibility fallback, and no bulk-clear API.

- [ ] **Step 3: Commit the red test**

```bash
git add tests/background/attachment-store.test.js
git commit -m "test: cover indexeddb screenshot storage"
```

## Chunk 2: Implement Shared Config and Settings UI

### Task 4: Replace the old MB limit with profile-based shared config

**Files:**
- Modify: `manifest.json`
- Modify: `src/extension/shared/constants.js`
- Modify: `src/extension/background/screenshot-policy.js`

- [ ] **Step 1: Add the manifest permission**

在 `permissions` 中增加 `unlimitedStorage`，确保扩展允许使用更大的本地配额。

- [ ] **Step 2: Define the screenshot profile map**

在 `src/extension/shared/constants.js` 中新增：
- `SCREENSHOT_STORAGE_PROFILES`
- `DEFAULT_SCREENSHOT_STORAGE_PROFILE`
- `DEFAULT_SETTINGS.screenshotStorageProfile`

保留旧字段的读取兼容，但停止让运行时直接依赖 `screenshotStorageLimitMb`，避免双重配置冗余。

- [ ] **Step 3: Rewrite storage limit resolution around the profile**

让 `screenshot-policy.js` 通过档位解析容量阈值，并补一个纯函数用于计算“设置变更后是否解除 `disabled_auto_quota`”。

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- tests/background/screenshot-policy.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add manifest.json src/extension/shared/constants.js src/extension/background/screenshot-policy.js tests/background/screenshot-policy.test.js
git commit -m "feat: add screenshot storage profiles"
```

### Task 5: Add the profile selector to Browser Action Monitor settings

**Files:**
- Modify: `options.html`
- Modify: `src/ui/options.js`
- Modify: `tests/ui/options-attachments.test.js`

- [ ] **Step 1: Add the settings controls**

在“Browser Action Monitor 设置”的附件区域增加 `screenshotStorageProfile` 下拉框，选项文案使用中文：
- `轻量`
- `均衡（推荐）`
- `取证`

并展示每档的容量、压缩质量、分辨率说明。

- [ ] **Step 2: Wire the field into settings load/save**

更新：
- `getFormValues`
- `fillForm`
- 默认加载/保存流程

要求：旧设置缺失该字段时回填 `balanced`。

- [ ] **Step 3: Run focused tests**

Run: `npm.cmd test -- tests/ui/options-attachments.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add options.html src/ui/options.js tests/ui/options-attachments.test.js
git commit -m "feat: add screenshot profile selector to settings"
```

## Chunk 3: Move Screenshot Bytes to IndexedDB and Apply Tiered Capture

### Task 6: Implement the IndexedDB-backed screenshot attachment store

**Files:**
- Create: `src/extension/background/attachment-indexeddb.js`
- Modify: `src/extension/background/attachment-store.js`
- Modify: `tests/background/attachment-store.test.js`

- [ ] **Step 1: Add the low-level IndexedDB helper**

封装：
- 打开数据库与对象仓
- `put/get/delete`
- `list usage`
- `clear`

记录结构至少包含：
- `actionId`
- `dataUrl`
- `mimeType`
- `width`
- `height`
- `sizeBytes`
- `savedAt`

- [ ] **Step 2: Upgrade the storage facade**

让 `attachment-store.js`：
- 优先写入 `IndexedDB`
- 读取时优先查 `IndexedDB`，未命中再查旧 `monitorAttachment:*`
- `getAttachmentUsage` 统计新存储，并在必要时合并旧兼容数据
- 暴露 `clearAllAttachments`

- [ ] **Step 3: Run focused tests**

Run: `npm.cmd test -- tests/background/attachment-store.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/extension/background/attachment-indexeddb.js src/extension/background/attachment-store.js tests/background/attachment-store.test.js
git commit -m "feat: store screenshots in indexeddb"
```

### Task 7: Add tier-driven screenshot capture and wire the new store into the background flow

**Files:**
- Create: `src/extension/background/screenshot-capture.js`
- Modify: `background.js`
- Modify: `src/extension/background/attachment-queue.js`
- Create: `tests/background/screenshot-capture.test.js`
- Modify: `tests/background/attachment-queue.test.js`
- Modify: `tests/background/sync.test.js`

- [ ] **Step 1: Write the failing tests**

新增并补充以下断言：
- 截图档位能映射到正确的 `jpegQuality` 与 `maxWidth`
- 队列成功后会把新存储返回的 `sizeBytes` 计入 `screenshotStorageBytes`
- 同步逻辑继续通过统一存储门面上传截图，不依赖旧 `chrome.storage.local`
- 缺失本地截图字节时仍返回 `missing_local_attachment`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- tests/background/screenshot-capture.test.js tests/background/attachment-queue.test.js tests/background/sync.test.js`
Expected: FAIL because capture is still hard-coded to `quality: 60`, has no resize helper, and the background flow still assumes the old storage path.

- [ ] **Step 3: Implement the capture helper**

在 `src/extension/background/screenshot-capture.js` 中提供一个可注入依赖的截图准备函数：
- 根据档位解析 `jpegQuality`
- 对超宽截图按 `maxWidth` 缩放
- 返回标准化的 `{ dataUrl, mimeType, width, height, sizeBytes }`

尽量把浏览器 API 依赖集中在一个函数里，便于单元测试。

- [ ] **Step 4: Wire background.js to the new helper and store**

更新后台装配逻辑：
- 初始化统一截图存储门面
- `captureVisibleTab` 后交给截图准备函数
- 使用新的 `saveScreenshotAttachment`
- 初始化时通过新门面计算真实截图占用
- `clearData` 时同时清空动作状态与本地截图附件

- [ ] **Step 5: Keep queue and sync behavior stable**

确认 `attachment-queue.js` 和 `sync.js` 继续只依赖统一门面，而不是感知 `IndexedDB` 细节。

- [ ] **Step 6: Run focused tests**

Run: `npm.cmd test -- tests/background/screenshot-capture.test.js tests/background/attachment-queue.test.js tests/background/sync.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/extension/background/screenshot-capture.js background.js src/extension/background/attachment-queue.js tests/background/screenshot-capture.test.js tests/background/attachment-queue.test.js tests/background/sync.test.js
git commit -m "feat: apply tiered screenshot capture"
```

## Chunk 4: Recovery Rules, Preview Compatibility, and Docs

### Task 8: Implement auto-recovery only for quota-driven shutdowns

**Files:**
- Modify: `background.js`
- Modify: `src/extension/background/screenshot-policy.js`
- Modify: `tests/background/screenshot-policy.test.js`

- [ ] **Step 1: Update settings-save recovery logic**

保存设置时：
- 如果用户手动关闭截图，保持 `disabled_manual`
- 如果截图此前因为 `storage-pressure` 自动停用，且新档位容量足够，则清除 `autoDisabled.screenshots`
- 仅恢复截图，不自动恢复被用户主动关闭的项

- [ ] **Step 2: Run focused tests**

Run: `npm.cmd test -- tests/background/screenshot-policy.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add background.js src/extension/background/screenshot-policy.js tests/background/screenshot-policy.test.js
git commit -m "feat: auto-recover screenshots after profile upgrade"
```

### Task 9: Verify records preview compatibility and document the feature in Chinese

**Files:**
- Modify: `src/ui/records.js`
- Modify: `tests/ui/records-attachments.test.js`
- Modify: `README.md`

- [ ] **Step 1: Lock the preview contract**

如果 `getActionAttachmentPreview` 返回结构未变，只补充测试，确保记录工作台继续能读取截图预览；如果读取链路需要适配，则把改动限制在 `records.js` 的预览逻辑。

- [ ] **Step 2: Update README in Chinese**

补充中文文档：
- 三个截图档位的容量/质量/分辨率
- 本地与服务端双份保留的行为
- 达到上限后自动关闭截图功能
- 提升档位后对 `disabled_auto_quota` 的自动恢复
- “清空数据”会清空本地记录与本地截图附件，但不会删除服务端已同步数据

- [ ] **Step 3: Run focused tests**

Run: `npm.cmd test -- tests/ui/records-attachments.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/ui/records.js tests/ui/records-attachments.test.js README.md
git commit -m "docs: document screenshot storage profiles"
```

### Task 10: Run full verification

**Files:**
- Verify only

- [ ] **Step 1: Run the full test suite**

Run: `npm.cmd test`
Expected: PASS with zero failures.

- [ ] **Step 2: Build the release package**

Run: `npm.cmd run release:pack`
Expected: PASS and emit the packaged extension under the existing release output path.

- [ ] **Step 3: Smoke-check the packaged feature**

手工验证：
1. 在设置页切换 `轻量 -> 均衡 -> 取证`，保存后刷新仍保留。
2. 开始记录几个页面动作，动作数增长，截图状态保持开启。
3. 打开记录工作台，确认截图预览可读。
4. 配置服务端并执行“立即同步”，确认动作元数据与截图附件都可上传。
5. 点击“清空数据”，确认本地记录和本地截图附件清空，但服务端数据仍在。

