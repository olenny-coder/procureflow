#!/usr/bin/env node
/**
 * Download (if needed) and run the stock engine CLI dev server.
 * Used by `pnpm engine:dev:stock` and `pnpm dev:stock-engine`.
 *
 * Registers the ProcureFlow search attributes too, but the app only uses them
 * when WORKFLOW_ENGINE_SEARCH_ATTRIBUTES=true (off for stock runs).
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, renameSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolsDir = path.join(root, ".tools", "engine-cli");
const exe = process.platform === "win32" ? ".exe" : "";
const binary = path.join(toolsDir, `engine${exe}`);
const ENGINE_CLI_VERSION = "1.9.1";

function archiveForPlatform() {
  const arch = process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : process.arch;
  if (process.platform === "win32") return `temporal_cli_${ENGINE_CLI_VERSION}_windows_${arch}.zip`;
  if (process.platform === "darwin") return `temporal_cli_${ENGINE_CLI_VERSION}_darwin_${arch}.tar.gz`;
  return `temporal_cli_${ENGINE_CLI_VERSION}_linux_${arch}.tar.gz`;
}

async function downloadCli() {
  const archiveName = archiveForPlatform();
  const url = `https://github.com/temporalio/cli/releases/download/v${ENGINE_CLI_VERSION}/${archiveName}`;
  const archivePath = path.join(toolsDir, archiveName);
  mkdirSync(toolsDir, { recursive: true });

  console.log(`[engine:stock] downloading engine CLI ${ENGINE_CLI_VERSION}`);
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

  console.log("[engine:stock] extracting CLI");
  const extracted = spawnSync("tar", ["-xf", archivePath, "-C", toolsDir], { stdio: "inherit" });
  const unpacked = path.join(toolsDir, `temporal${exe}`);
  if (extracted.status !== 0 || !existsSync(unpacked)) {
    throw new Error("Could not extract the engine CLI archive (tar is required).");
  }
  if (unpacked !== binary) {
    renameSync(unpacked, binary);
  }
}

async function main() {
  if (!existsSync(binary)) {
    await downloadCli();
  }

  mkdirSync(path.join(root, ".engine"), { recursive: true });

  const args = [
    "server",
    "start-dev",
    "--db-filename",
    path.join(root, ".engine", "dev.db"),
    "--port",
    process.env.WORKFLOW_ENGINE_PORT ?? "7233",
    "--ui-port",
    process.env.WORKFLOW_ENGINE_UI_PORT ?? "8233",
    "--search-attribute",
    "ProcureFlowDepartment=Keyword",
    "--search-attribute",
    "ProcureFlowRisk=Keyword",
    "--search-attribute",
    "ProcureFlowStatus=Keyword",
    "--log-level",
    process.env.WORKFLOW_ENGINE_LOG_LEVEL ?? "warn",
  ];

  console.log(`[engine:stock] ${binary} ${args.join(" ")}`);
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
  console.error(`[engine:stock] ${error.message}`);
  process.exit(1);
});
