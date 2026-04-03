# Popup Attachment Settings Relocation Design

## Goal

将插件弹窗中的 `DOM 快照`、`动作截图` 两个功能开关迁移到 `Browser Action Monitor 设置` 页面，同时把弹窗头部的记录状态与附件状态整合为一个统一信息块，提升信息层次与操作边界的清晰度。

## Scope

本次仅包含以下内容：

- 将 `captureDomSnapshots`、`captureScreenshots` 的配置入口从弹窗迁移到设置页
- 优化弹窗顶部状态展示
- 统一 DOM 与截图状态的视觉表达
- 补齐对应测试

本次不包含：

- 附件采集底层逻辑调整
- 队列、存储统计逻辑调整
- 同步逻辑调整
- 新增设置字段或新的状态枚举

## Current State

当前实现存在两个问题：

1. 附件开关位于弹窗中，和“开始记录 / 暂停记录 / 导出 / 同步”等运行时操作混在一起，配置与监控职责不清。
2. 弹窗中的附件状态以一整行机器式字符串展示，信息密度高但可读性弱，且 DOM / 截图的开关状态缺少统一视觉锚点。

## Design Summary

### 1. 设置页新增“附件采集”区块

在设置页中新增独立区块，位置放在“录制精度 / 隐私”之后、“服务端同步”之前。

区块内容：

- `DOM 快照`
- `动作截图`

交互方式沿用现有设置页 `toggle` 卡片样式，不引入新的控件风格。

### 2. 弹窗移除附件开关

弹窗中原有的：

- `DOM 快照`
- `动作截图`

两个 toggle card 完全移除。

弹窗不再承担附件采集配置职责，只保留运行状态查看与快捷操作入口。

### 3. 弹窗顶部统一状态块

弹窗顶部的 `status` 区块扩展为统一信息块，分两层展示：

- 第一层：记录状态、同步状态
- 第二层：DOM 状态、截图状态、队列数量、存储占用

展示目标：

- 保持现有紧凑结构
- 降低“长串状态文本”带来的阅读负担
- 让用户能快速扫描录制与附件状态

## Visual Language

### Status Dots

DOM 与截图状态前新增与“记录状态”一致的圆点指示器：

- 绿色圆点：开启
- 灰色圆点：关闭

队列和存储为数值指标，不使用圆点。

### Popup Copy

弹窗顶部不再使用 `enabled / disabled` 这类英文状态词，统一改为中文表达，例如：

- `DOM 开启`
- `DOM 关闭`
- `截图 开启`
- `截图 关闭`
- `队列 0`
- `存储 0.07 MB`

## Data Binding

不新增任何设置字段，直接复用现有配置：

- `captureDomSnapshots`
- `captureScreenshots`

### Settings Page

设置页 `loadSettings` / `saveSettings` 直接绑定这两个布尔字段。

### Popup

弹窗仅做只读展示：

- DOM 开启条件：`captureDomSnapshots !== false`
- 截图开启条件：`captureScreenshots !== false`
- 队列、存储继续来自 `stats.attachments.health`

弹窗不再保留附件设置保存逻辑。

## File Impact

### UI Files

- `options.html`
  - 新增“附件采集”区块
- `src/ui/options.js`
  - 绑定 `captureDomSnapshots`
  - 绑定 `captureScreenshots`
- `popup.html`
  - 移除附件开关卡片
  - 扩展顶部状态块结构
- `src/ui/popup.js`
  - 删除附件开关保存逻辑
  - 改写附件状态展示逻辑

### Tests

- `tests/ui/popup-attachments.test.js`
  - 更新为验证统一状态块与状态圆点
- 如设置页已有对应测试，则扩展；如没有，则补新增测试文件

## Behavior Details

### Settings Page Behavior

- 打开设置页时，两个附件开关展示当前保存值
- 点击“保存设置”后持久化到已有设置对象中
- 点击“恢复默认”时回到 `DEFAULT_SETTINGS`

### Popup Behavior

- 打开弹窗时读取：
  - `getStats`
  - `getSettings`
- 顶部状态块同步显示：
  - 记录状态
  - 同步状态
  - DOM 开关状态
  - 截图开关状态
  - 队列数量
  - 存储占用
- 点击“设置”进入设置页后，用户修改并保存设置，再次打开弹窗应立即看到更新结果

## Risks

### 1. Popup Tests Will Fail If Structure Changes Too Broadly

弹窗测试当前已经覆盖附件 UI，如果改动范围过大，容易把原本对记录状态和反馈区域的断言一起打碎。

应对方式：

- 只局部重构头部区块
- 保持既有 `id` 尽量稳定

### 2. Settings Page Currently Has No Attachment Controls

设置页新增字段后，若 `getFormValues` / `fillForm` 漏掉任何一个方向，会出现“显示值正确但保存无效”或“保存成功但刷新丢失”的问题。

应对方式：

- 测试同时覆盖加载与保存两个方向

## Testing

需要通过以下验证：

1. 设置页 UI 存在：
   - `DOM 快照`
   - `动作截图`
2. 设置页脚本可以正确加载和保存：
   - `captureDomSnapshots`
   - `captureScreenshots`
3. 弹窗不再存在附件切换开关
4. 弹窗存在统一状态块
5. 弹窗能正确显示：
   - 记录状态
   - DOM 状态
   - 截图状态
   - 队列数量
   - 存储占用
6. 全量测试通过：
   - `npm test`

## Recommendation

采用“设置页承载配置、弹窗承载状态与动作”的方案。

这是当前最清晰的职责划分，也最符合用户预期：

- 配置去设置页
- 运行查看和快捷操作留在弹窗

