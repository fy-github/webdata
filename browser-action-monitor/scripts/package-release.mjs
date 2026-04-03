import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRootFromScript = dirname(__dirname);
const RELEASE_NOTES_FILENAME = "RELEASE_NOTES_zh-CN.md";
const CHECKSUMS_FILENAME = "checksums.txt";
const EXTENSION_PACKAGE_ENTRIES = [
  "manifest.json",
  "background.js",
  "content.js",
  "options.html",
  "popup.html",
  "records.html",
  "src",
  "icons"
];
const SERVER_PACKAGE_ENTRIES = [
  "server",
  "scripts/server-manager.mjs",
  "package.json",
  "package-lock.json",
  "README.md",
  "docs/api.md",
  "docs/release.md"
];

function toPosixPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function escapePowerShellLiteral(value) {
  return String(value || "").replace(/'/g, "''");
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function shouldExcludeServerPath(relativePath) {
  const normalized = toPosixPath(relativePath);
  return normalized === "server/data/store.json"
    || normalized.startsWith("server/data/attachments/");
}

async function copyEntry(projectRoot, relativePath, destinationRoot, packageType) {
  const sourcePath = join(projectRoot, relativePath);
  const destinationPath = join(destinationRoot, relativePath);
  const sourceStats = await stat(sourcePath);

  if (sourceStats.isDirectory()) {
    await cp(sourcePath, destinationPath, {
      recursive: true,
      force: true,
      filter: (source) => {
        if (packageType !== "server") {
          return true;
        }

        const normalizedSource = toPosixPath(source);
        const normalizedRoot = toPosixPath(projectRoot);
        const relativeSourcePath = normalizedSource.startsWith(normalizedRoot)
          ? normalizedSource.slice(normalizedRoot.length + 1)
          : normalizedSource;

        return !shouldExcludeServerPath(relativeSourcePath);
      }
    });
    return;
  }

  await mkdir(dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath, { force: true });
}

async function hashFile(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

export function getReleaseDirectoryName(version) {
  return `release-${version}`;
}

export function getExtensionArchiveName(version) {
  return `browser-action-monitor-extension-${version}.zip`;
}

export function getServerArchiveName(version) {
  return `browser-action-monitor-server-${version}.zip`;
}

export function getExtensionPackageEntries() {
  return [...EXTENSION_PACKAGE_ENTRIES];
}

export function getServerPackageEntries() {
  return [...SERVER_PACKAGE_ENTRIES];
}

export function buildReleaseNotes({
  version,
  releaseDirName,
  extensionArchiveName,
  serverArchiveName
}) {
  return `# Browser Action Monitor 发布说明

## 版本信息

- 版本号：\`${version}\`
- 发布目录：\`${releaseDirName}\`

## 打包命令

\`\`\`bash
npm run release:pack
\`\`\`

## 产物结构

\`\`\`text
${releaseDirName}/
  extension/
    ${extensionArchiveName}
  server/
    ${serverArchiveName}
  ${RELEASE_NOTES_FILENAME}
  ${CHECKSUMS_FILENAME}
\`\`\`

## 扩展包说明

- ZIP 根目录直接包含扩展运行文件，可用于发布或解压后本地加载。
- 已包含：\`manifest.json\`、页面文件、\`src/\`、\`icons/\`
- 未包含：\`server/\`、\`tests/\`、\`docs/\`、\`node_modules/\`

## 服务端包说明

- ZIP 中包含服务端代码、启动脚本、\`package.json\`、中文 API 文档与发布文档。
- 已排除运行期数据：\`server/data/store.json\` 与 \`server/data/attachments/\`
- 解压后如未安装依赖，请先执行：

\`\`\`bash
npm install
npm run start:server
\`\`\`

## 校验文件

- \`${CHECKSUMS_FILENAME}\` 记录两个 ZIP 的 SHA-256 值，可用于交付校验。
`;
}

export function buildChecksums(entries) {
  return entries
    .map(({ hash, fileName }) => `${hash}  ${fileName}`)
    .join("\n");
}

export async function createZipArchive({ sourceDir, destinationFile }) {
  if (process.platform !== "win32") {
    throw new Error("release packaging currently requires Windows PowerShell");
  }

  const command = [
    `$src = '${escapePowerShellLiteral(sourceDir)}'`,
    `$dest = '${escapePowerShellLiteral(destinationFile)}'`,
    "if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }",
    "$items = @(Get-ChildItem -LiteralPath $src -Force)",
    "if ($items.Count -eq 0) {",
    "  throw 'Source directory is empty, nothing to archive'",
    "}",
    "Compress-Archive -LiteralPath ($items | ForEach-Object { $_.FullName }) -DestinationPath $dest -Force"
  ].join("; ");

  await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `PowerShell zip command failed with code ${code}`));
    });
  });
}

export async function createReleaseArtifacts({
  projectRoot = projectRootFromScript,
  distRoot = join(projectRoot, "dist"),
  zipCreator = createZipArchive
} = {}) {
  const packageJson = await readJsonFile(join(projectRoot, "package.json"));
  const version = String(packageJson.version || "").trim();
  if (!version) {
    throw new Error("package.json version is required for release packaging");
  }

  const releaseDirName = getReleaseDirectoryName(version);
  const releaseDir = join(distRoot, releaseDirName);
  const extensionStageDir = join(releaseDir, ".staging", "extension");
  const serverStageDir = join(releaseDir, ".staging", "server");
  const extensionOutputDir = join(releaseDir, "extension");
  const serverOutputDir = join(releaseDir, "server");
  const extensionArchiveName = getExtensionArchiveName(version);
  const serverArchiveName = getServerArchiveName(version);
  const extensionArchivePath = join(extensionOutputDir, extensionArchiveName);
  const serverArchivePath = join(serverOutputDir, serverArchiveName);
  const releaseNotesPath = join(releaseDir, RELEASE_NOTES_FILENAME);
  const checksumsPath = join(releaseDir, CHECKSUMS_FILENAME);

  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(extensionStageDir, { recursive: true });
  await mkdir(serverStageDir, { recursive: true });
  await mkdir(extensionOutputDir, { recursive: true });
  await mkdir(serverOutputDir, { recursive: true });

  for (const entry of getExtensionPackageEntries()) {
    await copyEntry(projectRoot, entry, extensionStageDir, "extension");
  }

  for (const entry of getServerPackageEntries()) {
    await copyEntry(projectRoot, entry, serverStageDir, "server");
  }

  await zipCreator({
    sourceDir: extensionStageDir,
    destinationFile: extensionArchivePath
  });
  await zipCreator({
    sourceDir: serverStageDir,
    destinationFile: serverArchivePath
  });

  await writeFile(releaseNotesPath, buildReleaseNotes({
    version,
    releaseDirName,
    extensionArchiveName,
    serverArchiveName
  }), "utf8");

  const checksums = buildChecksums([
    {
      fileName: join("extension", extensionArchiveName).replace(/\\/g, "/"),
      hash: await hashFile(extensionArchivePath)
    },
    {
      fileName: join("server", serverArchiveName).replace(/\\/g, "/"),
      hash: await hashFile(serverArchivePath)
    }
  ]);
  await writeFile(checksumsPath, `${checksums}\n`, "utf8");

  const stagingRoot = join(releaseDir, ".staging");
  if (await pathExists(stagingRoot)) {
    await rm(stagingRoot, { recursive: true, force: true });
  }

  return {
    version,
    releaseDirName,
    releaseDir,
    extensionArchivePath,
    serverArchivePath,
    releaseNotesPath,
    checksumsPath
  };
}

async function main() {
  const result = await createReleaseArtifacts();
  console.log(`Release directory: ${result.releaseDir}`);
  console.log(`Extension archive: ${result.extensionArchivePath}`);
  console.log(`Server archive: ${result.serverArchivePath}`);
  console.log(`Release notes: ${result.releaseNotesPath}`);
  console.log(`Checksums: ${result.checksumsPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  });
}
