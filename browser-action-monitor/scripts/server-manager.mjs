import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const command = process.argv[2] || "status";
const port = Number(process.env.PORT || 3000);
const baseUrl = `http://127.0.0.1:${port}`;
const runtimeDir = join(projectRoot, ".runtime");
const stateFile = join(runtimeDir, `server-${port}.json`);

function getManagedState() {
  if (!existsSync(stateFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(stateFile, "utf8"));
  } catch {
    return null;
  }
}

function isPidRunning(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function probeHealth() {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

async function removeStateFile() {
  await rm(stateFile, { force: true });
}

async function stopPid(pid) {
  if (!pid || !isPidRunning(pid)) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }

  process.kill(pid, "SIGTERM");
}

async function waitForHealth(expectUp, timeoutMs = 8000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const health = await probeHealth();
    if (Boolean(health) === expectUp) {
      return health;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return null;
}

async function printStatus() {
  const state = getManagedState();
  const health = await probeHealth();

  if (state?.pid && !isPidRunning(state.pid)) {
    await removeStateFile();
  }

  if (!health) {
    console.log(`Server is not responding on ${baseUrl}`);
    if (state?.pid) {
      console.log(`Managed PID file exists but process ${state.pid} is not healthy.`);
    }
    process.exit(1);
  }

  console.log(`Server is responding on ${baseUrl}`);
  console.log(`Version: ${health.version || "unknown"}`);
  console.log(`Agent export: ${health.features?.agentExport ? "enabled" : "disabled"}`);
  console.log(`Auth mode: ${health.authMode || "unknown"}`);

  if (state?.pid && isPidRunning(state.pid)) {
    console.log(`Managed PID: ${state.pid}`);
  } else {
    console.log("Managed PID: none");
  }
}

async function startServer() {
  await mkdir(runtimeDir, { recursive: true });

  const state = getManagedState();
  if (state?.pid && isPidRunning(state.pid)) {
    console.log(`Stopping previous managed server PID ${state.pid} on port ${port}...`);
    await stopPid(state.pid);
    await waitForHealth(false, 5000);
    await removeStateFile();
  } else if (state) {
    await removeStateFile();
  }

  const existingHealth = await probeHealth();
  if (existingHealth) {
    console.error(`Another server is already responding on ${baseUrl}.`);
    console.error(`Version: ${existingHealth.version || "unknown"}, agent export: ${existingHealth.features?.agentExport ? "enabled" : "disabled"}`);
    console.error("Stop that instance first, or use a different PORT.");
    process.exit(1);
  }

  const child = spawn(process.execPath, [join(projectRoot, "server", "index.js")], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port)
    },
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();

  const health = await waitForHealth(true, 8000);
  if (!health) {
    await stopPid(child.pid);
    console.error(`Server failed to become healthy on ${baseUrl}`);
    process.exit(1);
  }

  await writeFile(stateFile, JSON.stringify({
    pid: child.pid,
    port,
    baseUrl,
    version: packageJson.version,
    startedAt: new Date().toISOString()
  }, null, 2), "utf8");

  console.log(`Server started on ${baseUrl}`);
  console.log(`PID: ${child.pid}`);
  console.log(`Version: ${health.version || packageJson.version}`);
}

async function stopServer() {
  const state = getManagedState();

  if (state?.pid && isPidRunning(state.pid)) {
    await stopPid(state.pid);
    await waitForHealth(false, 5000);
    await removeStateFile();
    console.log(`Stopped managed server PID ${state.pid} on ${baseUrl}`);
    return;
  }

  await removeStateFile();
  const health = await probeHealth();
  if (health) {
    console.error(`An unmanaged server is still responding on ${baseUrl}. Stop it manually.`);
    console.error(`Version: ${health.version || "unknown"}, agent export: ${health.features?.agentExport ? "enabled" : "disabled"}`);
    process.exit(1);
  }

  console.log(`No managed server is running on ${baseUrl}`);
}

async function restartServer() {
  try {
    await stopServer();
  } catch {
    // no-op, restart should still try to start a fresh instance
  }
  await startServer();
}

if (command === "start") {
  await startServer();
} else if (command === "stop") {
  await stopServer();
} else if (command === "restart") {
  await restartServer();
} else if (command === "status") {
  await printStatus();
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
