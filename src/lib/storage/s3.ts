import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import type { PutObjectInput, StorageDriver } from "./types";

/**
 * S3-kompatibler Treiber (Hetzner Object Storage).
 *
 * Bucket ist PRIVAT. Es gibt keine ACL, die Objekte öffentlich macht; Zugriff
 * läuft ausschließlich über den Server (`get`) oder über kurzlebige signierte
 * URLs (`getSignedUrl`).
 *
 * Konfiguration aus der Umgebung, siehe `.env.example`:
 *   S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
 *   S3_FORCE_PATH_STYLE (Standard: true).
 */

export type S3Konfiguracja = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

/** Czyta konfigurację z env. Brak wartości = natychmiastowy błąd, nie ciche przejście na dysk. */
export function s3KonfiguracjaZEnv(
  env: NodeJS.ProcessEnv = process.env,
): S3Konfiguracja {
  const brak: string[] = [];
  const wymagane = [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ] as const;
  for (const k of wymagane) if (!env[k]) brak.push(k);
  if (brak.length > 0) {
    throw new Error(`STORAGE_DRIVER=s3 wymaga zmiennych: ${brak.join(", ")}`);
  }
  return {
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION!,
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    forcePathStyle: (env.S3_FORCE_PATH_STYLE ?? "true") !== "false",
  };
}

export function createS3Storage(cfg: S3Konfiguracja): StorageDriver {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });

  return {
    async put({ key, body, contentType, visibility }: PutObjectInput) {
      // Jawnie prywatne: brak ACL = brak publicznego odczytu. `visibility`
      // „public” jest tu świadomie nieobsługiwany — dokumenty nigdy nie są publiczne.
      if (visibility === "public") {
        throw new Error("S3 driver: publiczne obiekty są wyłączone");
      }
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return { key };
    },

    async get(key: string) {
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
        );
        if (!res.Body) return null;
        return Buffer.from(await res.Body.transformToByteArray());
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        if ((err as { name?: string }).name === "NoSuchKey") return null;
        throw err;
      }
    },

    async getSignedUrl(key: string, expiresInSeconds = 300) {
      return presign(
        client,
        new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    },

    async delete(key: string) {
      await client.send(
        new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
      );
    },
  };
}
