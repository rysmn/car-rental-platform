import type { StorageDriver } from "./types";
import { createLocalStorage } from "./local";
import { createS3Storage, s3KonfiguracjaZEnv } from "./s3";

/**
 * Storage factory. Driver selected by STORAGE_DRIVER:
 *   - "local" (default): disk-backed, dev only
 *   - "s3":   S3-compatible object storage (Hetzner Object Storage)
 */
let instance: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (instance) return instance;

  const driver = process.env.STORAGE_DRIVER ?? "local";
  switch (driver) {
    case "local":
      instance = createLocalStorage();
      return instance;
    case "s3":
      instance = createS3Storage(s3KonfiguracjaZEnv());
      return instance;
    default:
      throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
  }
}

export type { StorageDriver } from "./types";
