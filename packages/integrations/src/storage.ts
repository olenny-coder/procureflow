import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter, StoragePutResult } from "./types";

/** Local filesystem storage for development and self-hosted deployments. */
export class LocalStorageAdapter implements StorageAdapter {
  readonly name = "local";

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const normalized = key.replace(/^\/+/, "");
    if (normalized.includes("..")) throw new Error("Invalid storage key");
    return path.join(this.root, normalized);
  }

  async put(key: string, data: Uint8Array | string): Promise<StoragePutResult> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return { key, url: `file://${target}` };
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}

/**
 * Production stub. Wire an S3-compatible client (AWS SDK / Cloudflare R2) here;
 * the interface is already what activities consume. Metadata-only attachments
 * are acceptable in the MVP, so this adapter is not on the critical path.
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly name = "s3";

  async put(): Promise<StoragePutResult> {
    throw new Error(
      "S3 storage is not configured in this MVP. Set STORAGE_ADAPTER=local or implement S3StorageAdapter.",
    );
  }

  async get(): Promise<Uint8Array | null> {
    throw new Error(
      "S3 storage is not configured in this MVP. Set STORAGE_ADAPTER=local or implement S3StorageAdapter.",
    );
  }
}

export function createStorageAdapter(kind: string, directory: string): StorageAdapter {
  return kind === "s3" ? new S3StorageAdapter() : new LocalStorageAdapter(directory);
}
