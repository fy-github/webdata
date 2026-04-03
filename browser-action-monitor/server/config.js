import { join } from "node:path";

export function getServerConfig(overrides = {}) {
  return {
    port: Number(process.env.PORT || 3000),
    dataDir: process.env.DATA_DIR || join(process.cwd(), "server", "data"),
    authMode: process.env.AUTH_MODE || "none",
    apiKey: process.env.API_KEY || "",
    ...overrides
  };
}
