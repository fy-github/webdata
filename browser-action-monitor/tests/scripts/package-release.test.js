import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createReleaseArtifacts,
  getExtensionPackageEntries,
  getServerPackageEntries,
  getReleaseDirectoryName
} from "../../scripts/package-release.mjs";

async function writeProjectFile(projectRoot, relativePath, content) {
  const fullPath = join(projectRoot, relativePath);
  await mkdir(join(fullPath, ".."), { recursive: true });
  await writeFile(fullPath, content, "utf8");
}

test("release packaging entry lists stay scoped to extension and server artifacts", () => {
  const extensionEntries = getExtensionPackageEntries();
  const serverEntries = getServerPackageEntries();

  assert.deepEqual(extensionEntries.includes("manifest.json"), true);
  assert.deepEqual(extensionEntries.includes("server"), false);
  assert.deepEqual(serverEntries.includes("server"), true);
  assert.deepEqual(serverEntries.includes("server/data/store.json"), false);
  assert.deepEqual(serverEntries.includes("docs/release.md"), true);
});

test("createReleaseArtifacts builds a complete versioned release directory", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "browser-action-monitor-release-"));

  try {
    await writeProjectFile(projectRoot, "package.json", JSON.stringify({
      name: "browser-action-monitor",
      version: "1.2.3",
      private: true
    }, null, 2));
    await writeProjectFile(projectRoot, "package-lock.json", "{}");
    await writeProjectFile(projectRoot, "manifest.json", "{\"name\":\"Browser Action Monitor\"}");
    await writeProjectFile(projectRoot, "background.js", "console.log('background');");
    await writeProjectFile(projectRoot, "content.js", "console.log('content');");
    await writeProjectFile(projectRoot, "options.html", "<html></html>");
    await writeProjectFile(projectRoot, "popup.html", "<html></html>");
    await writeProjectFile(projectRoot, "records.html", "<html></html>");
    await writeProjectFile(projectRoot, "README.md", "# Browser Action Monitor\n");
    await writeProjectFile(projectRoot, "src/ui/options.js", "export {};\n");
    await writeProjectFile(projectRoot, "icons/icon16.png", "icon");
    await writeProjectFile(projectRoot, "server/index.js", "export {};\n");
    await writeProjectFile(projectRoot, "server/app.js", "export {};\n");
    await writeProjectFile(projectRoot, "server/data/.gitkeep", "");
    await writeProjectFile(projectRoot, "server/data/store.json", "{\"sessions\":{}}");
    await writeProjectFile(projectRoot, "server/data/attachments/example.txt", "ignore me");
    await writeProjectFile(projectRoot, "scripts/server-manager.mjs", "export {};\n");
    await writeProjectFile(projectRoot, "docs/api.md", "# API\n");
    await writeProjectFile(projectRoot, "docs/release.md", "# 发布说明\n");

    const zipCalls = [];
    const result = await createReleaseArtifacts({
      projectRoot,
      zipCreator: async ({ sourceDir, destinationFile }) => {
        zipCalls.push({ sourceDir, destinationFile });
        await writeFile(destinationFile, `mock zip from ${sourceDir}`, "utf8");
      }
    });

    assert.equal(result.version, "1.2.3");
    assert.equal(result.releaseDirName, getReleaseDirectoryName("1.2.3"));
    assert.equal(zipCalls.length, 2);

    const releaseNotes = await readFile(result.releaseNotesPath, "utf8");
    const checksums = await readFile(result.checksumsPath, "utf8");
    const extensionZip = await readFile(result.extensionArchivePath, "utf8");
    const serverZip = await readFile(result.serverArchivePath, "utf8");

    assert.match(releaseNotes, /发布目录/);
    assert.match(releaseNotes, /browser-action-monitor-extension-1\.2\.3\.zip/);
    assert.match(releaseNotes, /browser-action-monitor-server-1\.2\.3\.zip/);
    assert.match(checksums, /browser-action-monitor-extension-1\.2\.3\.zip/);
    assert.match(checksums, /browser-action-monitor-server-1\.2\.3\.zip/);
    assert.match(extensionZip, /mock zip/);
    assert.match(serverZip, /mock zip/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
