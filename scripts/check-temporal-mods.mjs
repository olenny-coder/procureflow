#!/usr/bin/env node
/**
 * CI/local guardrail: every change under third_party/temporal since the pinned
 * base tag must be documented in TEMPORAL_MODIFICATIONS.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_TAG = "temporal-base-96a50b1";
const modsPath = path.join(root, "TEMPORAL_MODIFICATIONS.md");

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

if (!existsSync(modsPath)) {
  console.error("TEMPORAL_MODIFICATIONS.md is missing.");
  process.exit(1);
}

if (!git(["rev-parse", "--verify", BASE_TAG], { allowFailure: true })) {
  console.error(
    `Base tag ${BASE_TAG} not found. CI must checkout with full history (actions/checkout fetch-depth: 0).`,
  );
  process.exit(1);
}

const documented = readFileSync(modsPath, "utf8");
const changed = new Set();

const diff = git(["diff", "--name-only", BASE_TAG, "--", "third_party/temporal"]);
for (const file of diff.split("\n").filter(Boolean)) changed.add(file);

// Include uncommitted/untracked changes so the check is useful before a commit too.
const status = git(["status", "--porcelain", "-uall", "--", "third_party/temporal"]);
for (const line of status.split("\n").filter(Boolean)) {
  const file = line.slice(3).trim().replace(/^"|"$/g, "");
  if (file.endsWith("/")) continue;
  changed.add(file);
}

const filtered = [...changed].filter((file) => {
  if (!file.startsWith("third_party/temporal/")) return false;
  if (file.includes("/.build/")) return false;
  if (file.endsWith(".db") || file.endsWith(".db-wal") || file.endsWith(".db-shm")) return false;
  return true;
});

const undocumented = filtered.filter((file) => !documented.includes(file));

if (undocumented.length > 0) {
  console.error("The following Temporal changes are not documented in TEMPORAL_MODIFICATIONS.md:");
  for (const file of undocumented) console.error(`  - ${file}`);
  process.exit(1);
}

console.log(
  `[temporal:check] OK — ${filtered.length} changed file${filtered.length === 1 ? "" : "s"} under third_party/temporal, all documented.`,
);
if (filtered.length > 0) {
  for (const file of filtered) console.log(`  · ${file}`);
}
