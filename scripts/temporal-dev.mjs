#!/usr/bin/env node
/**
 * Run the locally reworked Temporal server with the ProcureFlow dev config:
 *   - durable SQLite file (third_party/temporal/.build/temporal.db)
 *   - single-binary dev topology on 127.0.0.1:7233
 *   - ProcureFlow bootstrap: default namespace + custom search attributes
 *
 * This is the default Temporal for `pnpm dev`; `pnpm dev:stock-temporal` uses
 * the upstream Temporal CLI dev server instead.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "third_party", "temporal");
const bin = path.join(src, ".build", "bin");
const exe = process.platform === "win32" ? ".exe" : "";
const server = path.join(bin, `temporal-server${exe}`);
const bootstrap = path.join(bin, `procureflow-bootstrap${exe}`);

if (!existsSync(server) || !existsSync(bootstrap)) {
  console.log("[temporal:dev] reworked Temporal binaries are missing; building now (Go 1.27+ required)");
  const build = spawnSync(process.execPath, [path.join(root, "scripts", "temporal-build.mjs")], {
    stdio: "inherit",
  });
  if (build.status !== 0 || !existsSync(server) || !existsSync(bootstrap)) {
    console.error(
      "[temporal:dev] build failed. Run `pnpm temporal:build` after installing Go 1.27+.\n" +
        "  Alternatively use `pnpm dev:stock-temporal` (no Go required).",
    );
    process.exit(1);
  }
}

mkdirSync(path.join(src, ".build"), { recursive: true });

const env = { ...process.env };
env.TEMPORAL_ADDRESS ??= "127.0.0.1:7233";
env.TEMPORAL_NAMESPACE ??= "default";

console.log(`[temporal:dev] starting reworked Temporal (${server})`);
const serverProcess = spawn(
  server,
  ["--allow-no-auth", "--config-file", "config/procureflow-dev.yaml", "start"],
  { cwd: src, stdio: "inherit", env },
);

let bootstrapProcess;
let stopping = false;

function startBootstrap() {
  console.log("[temporal:dev] provisioning namespace + ProcureFlow search attributes");
  bootstrapProcess = spawn(bootstrap, [], {
    cwd: src,
    stdio: "inherit",
    env: {
      ...env,
      TEMPORAL_BOOTSTRAP_WAIT_SECONDS: env.TEMPORAL_BOOTSTRAP_WAIT_SECONDS ?? "120",
    },
  });
  bootstrapProcess.on("exit", (code) => {
    if (code !== 0 && !stopping) {
      console.error(`[temporal:dev] bootstrap exited with ${code}. Server remains running.`);
    }
  });
}

setTimeout(startBootstrap, 1_500);

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[temporal:dev] shutting down (${signal})`);
  if (bootstrapProcess && !bootstrapProcess.killed) bootstrapProcess.kill();
  if (!serverProcess.killed) serverProcess.kill("SIGTERM");
  setTimeout(() => {
    if (!serverProcess.killed) serverProcess.kill("SIGKILL");
  }, 5_000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

serverProcess.on("exit", (code) => {
  if (!stopping) {
    console.error(`[temporal:dev] server exited with code ${code}`);
    process.exit(code ?? 1);
  }
  process.exit(0);
});
