# Browser Action Monitor 发布说明

## 版本信息

- 版本号：`1.0.0`
- 发布目录：`release-1.0.0`

## 打包命令

```bash
npm run release:pack
```

## 产物结构

```text
release-1.0.0/
  extension/
    browser-action-monitor-extension-1.0.0.zip
  server/
    browser-action-monitor-server-1.0.0.zip
  RELEASE_NOTES_zh-CN.md
  checksums.txt
```

## 扩展包说明

- ZIP 根目录直接包含扩展运行文件，可用于发布或解压后本地加载。
- 已包含：`manifest.json`、页面文件、`src/`、`icons/`
- 未包含：`server/`、`tests/`、`docs/`、`node_modules/`

## 服务端包说明

- ZIP 中包含服务端代码、启动脚本、`package.json`、中文 API 文档与发布文档。
- 已排除运行期数据：`server/data/store.json` 与 `server/data/attachments/`
- 解压后如未安装依赖，请先执行：

```bash
npm install
npm run start:server
```

## 校验文件

- `checksums.txt` 记录两个 ZIP 的 SHA-256 值，可用于交付校验。
