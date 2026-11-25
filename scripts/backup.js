// scripts/backup.js
// Nightly backup: database (pg_dump) + new patient images -> Backblaze B2.
// - The database password is passed through PGPASSWORD, never on the command line, so it can never be printed.
// - The dump is checked (pg_restore must be able to read it) BEFORE it is uploaded.
// - Patient images (Supabase Storage) are copied too: only the ones not already in Backblaze.
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// pg connection settings from DATABASE_URL (Supabase needs sslmode=require)
function pgEnvFrom(databaseUrl) {
  const u = new URL(databaseUrl);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
    PGSSLMODE: u.searchParams.get("sslmode") || "require",
  };
}

// a message that is safe to print: no secrets, no credentials inside an address
function safeMessage(err, secrets) {
  let msg = String(err?.message || err);
  for (const s of secrets) if (s) msg = msg.split(s).join("***");
  return msg.replace(/:\/\/[^@\s/]+@/g, "://***@");
}

// every file path in a Supabase Storage bucket (a listed item without an id is a folder)
async function listStorage(baseUrl, key, bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${baseUrl}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`Storage list failed (${res.status})`);
    const items = await res.json();
    for (const it of items) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id) files.push(p);
      else files.push(...(await listStorage(baseUrl, key, bucket, p)));
    }
    if (items.length < 1000) return files;
  }
}

// copy the images that Backblaze does not have yet (images never change, so a copy is final)
async function backupImages(s3, b2Bucket, prefix) {
  const baseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET || "images";
  if (!baseUrl || !key) {
    console.log("Images skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set on this job.");
    return;
  }
  const imagesPrefix = `${prefix}-images/`;
  const have = new Set();
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: b2Bucket, Prefix: imagesPrefix, ContinuationToken: token }));
    for (const o of r.Contents || []) have.add(o.Key);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);

  const files = await listStorage(baseUrl, key, bucket);
  let copied = 0;
  for (const file of files) {
    const target = imagesPrefix + file;
    if (have.has(target)) continue;
    const encoded = file.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${baseUrl}/storage/v1/object/${bucket}/${encoded}`, { headers: { Authorization: `Bearer ${key}`, apikey: key } });
    if (!res.ok) throw new Error(`Image download failed (${res.status}): ${file}`);
    await s3.send(new PutObjectCommand({
      Bucket: b2Bucket,
      Key: target,
      Body: Buffer.from(await res.arrayBuffer()),
      ContentType: res.headers.get("content-type") || "application/octet-stream",
    }));
    copied++;
  }
  console.log(`Images: ${files.length} in storage, ${copied} new copied.`);
}

async function main() {
  const DATABASE_URL = must("DATABASE_URL");
  const B2_BUCKET_NAME = must("B2_BUCKET_NAME");
  const B2_ENDPOINT = must("B2_ENDPOINT"); // example: https://s3.eu-central-003.backblazeb2.com
  const B2_ACCESS_KEY_ID = must("B2_ACCESS_KEY_ID");
  const B2_SECRET_ACCESS_KEY = must("B2_SECRET_ACCESS_KEY");
  const pgEnv = pgEnvFrom(DATABASE_URL);
  const secrets = [pgEnv.PGPASSWORD, B2_SECRET_ACCESS_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY];

  // Optional
  const BACKUP_PREFIX = process.env.BACKUP_PREFIX || "clinic";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"); // safe for filenames

  // Output file in the temp folder (/tmp on Render)
  const dumpPath = path.join(os.tmpdir(), `${BACKUP_PREFIX}-${stamp}.dump`);

  try {
    console.log("Starting pg_dump ->", dumpPath);

    // 1) Create a compressed custom-format dump (best for restore). Requires the pg_dump binary.
    const pgOpts = { env: { ...process.env, ...pgEnv }, maxBuffer: 64 * 1024 * 1024 };
    await execFileAsync("pg_dump", ["--format=c", "--no-owner", "--no-privileges", "--file", dumpPath], pgOpts);

    // 2) Check the dump BEFORE uploading: not empty, and pg_restore can read its table list
    const size = fs.statSync(dumpPath).size;
    const { stdout } = await execFileAsync("pg_restore", ["--list", dumpPath], pgOpts);
    if (size === 0 || !stdout.includes("TABLE DATA")) throw new Error("Backup file is empty or unreadable — not uploaded.");
    console.log(`Dump created and checked. Size: ${Math.round(size / 1024 / 1024)} MB, tables with data: ${(stdout.match(/TABLE DATA/g) || []).length}`);

    // 3) Upload to Backblaze B2 (S3 compatible)
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

    // 4) Patient images (after the database is safe)
    await backupImages(s3, B2_BUCKET_NAME, BACKUP_PREFIX);
  } catch (err) {
    throw new Error(safeMessage(err, secrets));
  } finally {
    // 5) Cleanup local temp file (also when something above failed)
    if (fs.existsSync(dumpPath)) {
      fs.unlinkSync(dumpPath);
      console.log("Cleanup done.");
    }
  }
}

main().catch((err) => {
  console.error("❌ Backup failed:", err?.message || err);
  process.exit(1);
});
