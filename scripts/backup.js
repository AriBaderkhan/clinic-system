// scripts/backup.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function withSslModeRequire(url) {
  // Supabase often needs sslmode=require
  if (url.includes("sslmode=")) return url;
  return url.includes("?") ? `${url}&sslmode=require` : `${url}?sslmode=require`;
}

async function main() {
  const DATABASE_URL = withSslModeRequire(must("DATABASE_URL"));

  const B2_BUCKET_NAME = must("B2_BUCKET_NAME");
  const B2_ENDPOINT = must("B2_ENDPOINT"); // example: https://s3.eu-central-003.backblazeb2.com
  const B2_ACCESS_KEY_ID = must("B2_ACCESS_KEY_ID");
  const B2_SECRET_ACCESS_KEY = must("B2_SECRET_ACCESS_KEY");

  // Optional
  const BACKUP_PREFIX = process.env.BACKUP_PREFIX || "clinic";
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-"); // safe for filenames

  // Output file in /tmp (Render allows it)
  const dumpPath = path.join("/tmp", `${BACKUP_PREFIX}-${stamp}.dump`);

  console.log("Starting pg_dump ->", dumpPath);

  // 1) Create a compressed custom-format dump (best for restore)
  // Requires pg_dump binary available on the machine.
  await execFileAsync("pg_dump", [
    DATABASE_URL,
    "--format=c",            // custom format
    "--no-owner",
    "--no-privileges",
    "--file",
    dumpPath,
  ]);

  const size = fs.statSync(dumpPath).size;
  console.log(`Dump created. Size: ${Math.round(size / 1024 / 1024)} MB`);

  // 2) Upload to Backblaze B2 (S3 compatible)
  const key = `${BACKUP_PREFIX}/${BACKUP_PREFIX}-${stamp}.dump`;

  const s3 = new S3Client({
    region: "us-east-1",
    endpoint: B2_ENDPOINT.startsWith("http") ? B2_ENDPOINT : `https://${B2_ENDPOINT}`,
    credentials: {
      accessKeyId: B2_ACCESS_KEY_ID,
      secretAccessKey: B2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });

  console.log("Uploading to Backblaze:", `${B2_BUCKET_NAME}/${key}`);

  await s3.send(
    new PutObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: key,
      Body: fs.createReadStream(dumpPath),
      ContentType: "application/octet-stream",
    })
  );

  console.log("✅ Upload done.");

  // 3) Cleanup local temp file
  fs.unlinkSync(dumpPath);
  console.log("Cleanup done.");
}

main().catch((err) => {
  console.error("❌ Backup failed:", err?.message || err);
  process.exit(1);
});