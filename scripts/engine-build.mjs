#!/usr/bin/env node
/**
 * Cross-platform build for the locally reworked engine distribution.
 * Builds the upstream server plus the ProcureFlow bootstrap command into
 * third_party/temporal/.build/bin (gitignored).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "third_party", "temporal");
const outDir = path.join(src, ".build", "bin");
const exe = process.platform === "win32" ? ".exe" : "";

if (!existsSync(path.join(src, "go.mod"))) {
  console.error("[engine:build] third_party/temporal/go.mod not found. Is the vendored tree present?");
  process.exit(1);
}

const bundledGo = path.join(root, ".tools", "go", "go", "bin", process.platform === "win32" ? "go.exe" : "go");
const go = process.env.GO ?? (existsSync(bundledGo) ? bundledGo : "go");

function run(args) {
  console.log(`[engine:build] ${go} ${args.join(" ")}`);
  const result = spawnSync(go, args, {
    cwd: src,
    stdio: "inherit",
    env: {
      ...process.env,
      CGO_ENABLED: "0",
      GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "auto",
    },
  });
  if (result.error) {
    console.error(`[engine:build] failed to launch go: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[engine:build] go exited with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

const version = spawnSync(go, ["version"], { encoding: "utf8" });
if (version.status !== 0) {
  console.error(
    "[engine:build] Go 1.27+ is required. Install Go or place a toolchain at .tools/go, then retry.",
  );
  process.exit(1);
}
console.log(`[engine:build] ${version.stdout.trim()}`);

mkdirSync(outDir, { recursive: true });
run([
  "build",
  "-trimpath",
  "-ldflags",
  "-s -w",
  "-o",
  path.join(outDir, `engine-server${exe}`),
  "./cmd/server",
]);
run([
  "build",
  "-trimpath",
  "-ldflags",
  "-s -w",
  "-o",
  path.join(outDir, `procureflow-bootstrap${exe}`),
  "./cmd/tools/procureflow-bootstrap",
]);

console.log(`[engine:build] done -> ${outDir}`);
console.log("[engine:build] start with: pnpm engine:dev");
