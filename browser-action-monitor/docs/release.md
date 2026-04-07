# Browser Action Monitor 打包与发布说明

## 1. 目标

本项目提供一个统一的发布打包命令，用于一次性生成以下交付物：

- 浏览器扩展发布包
- 服务端发布包
- 中文发布说明
- SHA-256 校验文件

## 2. 执行命令

在项目根目录执行：

```bash
npm run release:pack
```

## 3. 输出目录

命令执行完成后，会在 `dist/` 下生成按版本号命名的发布目录：

```text
dist/
  release-<version>/
    extension/
      browser-action-monitor-extension-<version>.zip
    server/
      browser-action-monitor-server-<version>.zip
    RELEASE_NOTES_zh-CN.md
    checksums.txt
```

示例：

```text
dist/release-2.0.0/
```

## 4. 扩展包内容

扩展 ZIP 仅包含运行扩展所需的文件：

- `manifest.json`
- `background.js`
- `content.js`
- `options.html`
- `popup.html`
- `records.html`
- `src/`
- `icons/`

不会打进扩展包的内容包括：

- `server/`
- `tests/`
- `docs/`
- `node_modules/`
- `.runtime/`
- `.superpowers/`

说明：

- 该 ZIP 适合用于发布归档。
- 如果需要本地“加载已解压的扩展程序”，请先解压 ZIP，再选择解压后的目录。

## 5. 服务端包内容

服务端 ZIP 包含：

- `server/`
- `scripts/server-manager.mjs`
- `package.json`
- `package-lock.json`
- `README.md`
- `docs/api.md`
- `docs/release.md`

服务端运行期数据不会被打进发布包，主要包括：

- `server/data/store.json`
- `server/data/attachments/`

保留项：

- `server/data/.gitkeep`

这样可以保证：

- 发布包可重复生成
- 不会把本地测试数据或生产数据打进交付物
- 新环境解压后仍然保留数据目录结构

## 6. 服务端启动方式

解压服务端发布包后，在服务端包目录中执行：

```bash
npm install
npm run start:server
```

如需前台启动：

```bash
npm run start:server:foreground
```

常用环境变量：

- `PORT`：服务端监听端口，默认 `3000`
- `DATA_DIR`：服务端数据目录
- `AUTH_MODE`：鉴权模式，支持 `none` 与 `apiKey`
- `API_KEY`：当 `AUTH_MODE=apiKey` 时使用

## 7. 校验文件

发布目录中的 `checksums.txt` 记录两个 ZIP 文件的 SHA-256 值，格式如下：

```text
<sha256>  extension/browser-action-monitor-extension-<version>.zip
<sha256>  server/browser-action-monitor-server-<version>.zip
```

可用于：

- 交付前校验
- 多环境传输后核对文件一致性
- 归档留痕

## 8. 当前脚本说明

当前发布脚本基于 Node.js 编排，并在 Windows 环境下调用 PowerShell 生成 ZIP。

这意味着：

- 当前开发环境可直接执行
- 若后续需要在非 Windows 环境打包，需要再补一套跨平台 ZIP 实现
