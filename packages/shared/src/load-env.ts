/**
 * Side-effect module: loads .env from the repository root regardless of the
 * package/app working directory. Import this first in every Node entrypoint.
 */
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

export function findRepoRoot(start = process.cwd()): string {
  let current = path.resolve(start);
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(start);
}

export const REPO_ROOT = findRepoRoot();

const loaded: string[] = [];
for (const file of [".env", ".env.local"]) {
  const full = path.join(REPO_ROOT, file);
  if (existsSync(full)) {
    loadDotenv({ path: full, override: file === ".env.local" });
    loaded.push(file);
  }
}

export function loadedEnvFiles(): string[] {
  return [...loaded];
}
