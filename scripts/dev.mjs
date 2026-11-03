#!/usr/bin/env node
/**
 * One-command local development:
 *   Postgres -> workflow engine (reworked by default) -> migrations/seed -> worker -> web
 *
 * Flags:
 *   --stock-engine   use the stock engine CLI dev server instead of the local rework
 *   --skip-seed      do not run the idempotent demo seed
 */
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(root, ".env") });
loadEnv({ path: path.join(root, ".env.local"), override: true });

const args = new Set(process.argv.slice(2));
const stockEngine = args.has("--stock-engine");
const reworkedEngine = args.has("--reworked-engine") || !stockEngine;
const skipSeed = args.has("--skip-seed");

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = [];

function log(message) {
  console.log(`\x1b[35m[procureflow]\x1b[0m ${message}`);
}

function shell(command, commandArgs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function tcpCheck(host, port, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForTcp(host, port, label, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tcpCheck(host, port)) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for ${label} at ${host}:${port}`);
}

function databaseTarget() {
  const url = process.env.DATABASE_URL ?? "postgresql://procureflow:procureflow@localhost:5432/procureflow";
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: Number(parsed.port || 5432) };
  } catch {
    return { host: "localhost", port: 5432 };
  }
}

async function ensurePostgres() {
  const { host, port } = databaseTarget();
  if (await tcpCheck(host, port)) {
    log(`Postgres already running at ${host}:${port}`);
    return;
  }
  log("Postgres is not running; starting docker compose service 'postgres'");
  const exit = await shell("docker", ["compose", "up", "-d", "postgres"]);
  if (exit !== 0) {
    throw new Error(
      "Could not start Postgres. Start Docker Desktop (or Postgres) and retry, or set DATABASE_URL to a running database.",
    );
  }
  await waitForTcp(host, port, "Postgres");
}

function startChild(label, command, commandArgs, env = {}) {
  log(`starting ${label}`);
  const isNode = path.resolve(command) === path.resolve(process.execPath);
  const child = spawn(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32" && !isNode,
    env: { ...process.env, ...env },
  });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      log(`${label} exited with code ${code}; stopping dev stack`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.reverse()) {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }
  setTimeout(() => process.exit(code), 800);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  log(`mode: ${stockEngine ? "stock engine CLI" : "reworked engine (local vendor)"}`);
  await ensurePostgres();

  const engineEnv = { ...process.env };
  if (stockEngine) {
    engineEnv.WORKFLOW_ENGINE_SEARCH_ATTRIBUTES = "false";
  } else {
    engineEnv.WORKFLOW_ENGINE_SEARCH_ATTRIBUTES = "true";
  }

  if (stockEngine) {
    startChild("stock engine", process.execPath, [path.join(root, "scripts", "stock-engine.mjs")], engineEnv);
  } else {
    startChild("reworked engine", process.execPath, [path.join(root, "scripts", "engine-dev.mjs")], engineEnv);
  }

  await waitForTcp("127.0.0.1", Number(process.env.WORKFLOW_ENGINE_PORT ?? 7233), "workflow engine");

  log("applying database migrations");
  const migrateExit = await shell(pnpm, ["db:migrate"]);
  if (migrateExit !== 0) throw new Error("Database migration failed");

  if (!skipSeed) {
    log("seeding demo data (idempotent)");
    await shell(pnpm, ["db:seed"]);
  }

  const appEnv = {
    ...process.env,
    WORKFLOW_ENGINE_SEARCH_ATTRIBUTES: stockEngine ? "false" : "true",
  };
  startChild("workflow worker", pnpm, ["--filter", "@procureflow/worker", "start"], appEnv);
  startChild("Next.js web", pnpm, ["--filter", "@procureflow/web", "dev"], appEnv);

  log("ProcureFlow is starting at http://localhost:3000");
  log("Demo login: requester@procureflow.dev / Demo1234!");
  log("Press Ctrl+C to stop everything.");
}

main().catch((error) => {
  console.error(`\x1b[31m[procureflow]\x1b[0m ${error instanceof Error ? error.message : error}`);
  shutdown(1);
});
