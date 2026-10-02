import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyBuildNode } from "./verify-runtime.mjs";

// An old npm node_modules tree can shadow pnpm's versions during Vercel tracing.
// Remove only this frontend's generated dependency tree; retain the pnpm store.
verifyBuildNode();
const root = fileURLToPath(new URL("../", import.meta.url));
rmSync(new URL("../node_modules", import.meta.url), { recursive: true, force: true });
const result = spawnSync("corepack", ["pnpm", "install", "--frozen-lockfile"], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
