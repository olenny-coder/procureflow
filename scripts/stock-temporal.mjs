#!/usr/bin/env node
/**
 * Download (if needed) and run the stock Temporal CLI dev server.
 * Used by `pnpm temporal:dev:stock` and `pnpm dev:stock-temporal`.
 *
 * Registers the ProcureFlow search attributes too, but the app only uses them
 * when TEMPORAL_REWORK_ENABLED=true (off for stock runs).
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolsDir = path.join(root, ".tools", "temporal-cli");
const exe = process.platform === "win32" ? ".exe" : "";
const binary = path.join(toolsDir, `temporal${exe}`);
const TEMPORAL_CLI_VERSION = "1.9.1";

function archiveForPlatform() {
  const arch = process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : process.arch;
  if (process.platform === "win32") return `temporal_cli_${TEMPORAL_CLI_VERSION}_windows_${arch}.zip`;
  if (process.platform === "darwin") return `temporal_cli_${TEMPORAL_CLI_VERSION}_darwin_${arch}.tar.gz`;
  return `temporal_cli_${TEMPORAL_CLI_VERSION}_linux_${arch}.tar.gz`;
}

async function downloadCli() {
  const archiveName = archiveForPlatform();
  const url = `https://github.com/temporalio/cli/releases/download/v${TEMPORAL_CLI_VERSION}/${archiveName}`;
  const archivePath = path.join(toolsDir, archiveName);
  mkdirSync(toolsDir, { recursive: true });

  console.log(`[temporal:stock] downloading Temporal CLI ${TEMPORAL_CLI_VERSION}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  await new Promise((resolve, reject) => {
    const file = createWriteStream(archivePath);
    Readable.fromWeb(response.body).pipe(file);
    file.on("finish", resolve);
    file.on("error", reject);
  });

  console.log("[temporal:stock] extracting CLI");
  const extracted = spawnSync("tar", ["-xf", archivePath, "-C", toolsDir], { stdio: "inherit" });
  if (extracted.status !== 0 || !existsSync(binary)) {
    throw new Error("Could not extract the Temporal CLI archive (tar is required).");
  }
}

async function main() {
  if (!existsSync(binary)) {
    await downloadCli();
  }

  mkdirSync(path.join(root, ".temporal"), { recursive: true });

  const args = [
    "server",
    "start-dev",
    "--db-filename",
    path.join(root, ".temporal", "dev.db"),
    "--port",
    process.env.TEMPORAL_PORT ?? "7233",
    "--ui-port",
    process.env.TEMPORAL_UI_PORT ?? "8233",
    "--search-attribute",
    "ProcureFlowDepartment=Keyword",
    "--search-attribute",
    "ProcureFlowRisk=Keyword",
    "--search-attribute",
    "ProcureFlowStatus=Keyword",
    "--log-level",
    process.env.TEMPORAL_LOG_LEVEL ?? "warn",
  ];

  console.log(`[temporal:stock] ${binary} ${args.join(" ")}`);
  const child = spawn(binary, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill("SIGTERM"));
  }
}

main().catch((error) => {
  console.error(`[temporal:stock] ${error.message}`);
  process.exit(1);
});
